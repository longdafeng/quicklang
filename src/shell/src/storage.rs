//! The native connection is created and used only on this dedicated thread.
use quicklang_domain::{AppError, Rating, ReviewState};
use quicklang_storage_port::{Clock, CommitResult};
use quicklang_storage_seekdb::SeekDbEmbeddedAdapter;
use serde::Serialize;
use std::{
    path::PathBuf,
    sync::{mpsc, Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Serialize)]
pub struct RuntimeStatus {
    pub phase: String,
    pub storage: String,
    pub persistence_ready: bool,
    pub error: Option<AppError>,
    pub library_phase: String,
    pub library_ready: bool,
    pub library_error: Option<AppError>,
}
type Reply = mpsc::Sender<Result<ReviewState, AppError>>;
enum Request {
    AiProfiles(
        crate::ai_profiles::ProfileOperation,
        mpsc::Sender<Result<quicklang_storage_seekdb::ai_profiles::ProfilesSnapshot, AppError>>,
    ),
    AiProfileResolve(
        String,
        mpsc::Sender<Result<quicklang_storage_seekdb::ai_profiles::ResolvedProfile, AppError>>,
    ),
    SpeechPreference(Option<bool>, mpsc::Sender<Result<bool, AppError>>),
    SpeechEnhancedAvailable(Option<bool>, mpsc::Sender<Result<bool, AppError>>),
    Listening(
        String,
        quicklang_storage_seekdb::listening::ListeningRequest,
        mpsc::Sender<Result<serde_json::Value, AppError>>,
    ),
    Load(String, Reply),
    Rate {
        card: String,
        event: String,
        version: u64,
        rating: Rating,
        reply: Reply,
    },
}
pub struct StorageService {
    sender: mpsc::SyncSender<Request>,
    status: Arc<Mutex<RuntimeStatus>>,
}
struct WallClock;
impl Clock for WallClock {
    fn now_ms(&self) -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0)
    }
}
fn unavailable() -> AppError {
    AppError::new("DB_UNAVAILABLE", "Storage worker is unavailable", true)
}
impl StorageService {
    /// Start the base database on its owning thread. Seed validation is pure file
    /// work on a separate thread; native import batches stay on the database owner.
    pub fn start(data: PathBuf, runtime: PathBuf, library: PathBuf) -> Self {
        Self::start_with_loader(data, runtime, move || {
            quicklang_storage_seekdb::word_library::LibrarySeed::load(&library)
        })
    }
    fn start_with_loader(
        data: PathBuf,
        runtime: PathBuf,
        loader: impl FnOnce() -> Result<quicklang_storage_seekdb::word_library::LibrarySeed, AppError>
            + Send
            + 'static,
    ) -> Self {
        Self::start_with_keys(data, runtime, loader, crate::ai_profiles::KeychainMasterKey)
    }
    fn start_with_keys<
        K: quicklang_storage_seekdb::ai_profiles::MasterKeyStore + Send + Sync + 'static,
    >(
        data: PathBuf,
        runtime: PathBuf,
        loader: impl FnOnce() -> Result<quicklang_storage_seekdb::word_library::LibrarySeed, AppError>
            + Send
            + 'static,
        keys: K,
    ) -> Self {
        let keys = Arc::new(keys);
        let (sender, receiver) = mpsc::sync_channel(32);
        let status = Arc::new(Mutex::new(RuntimeStatus {
            phase: "starting".into(),
            storage: "seekdb_1.4.0".into(),
            persistence_ready: false,
            error: None,
            library_phase: "waiting".into(),
            library_ready: false,
            library_error: None,
        }));
        let worker_status = status.clone();
        std::thread::spawn(move || {
            let started = std::time::Instant::now();
            let opened = SeekDbEmbeddedAdapter::open_with_runtime(&data, &runtime);
            let mut db = match opened {
                Ok(db) => db,
                Err(error) => {
                    let mut status = worker_status.lock().unwrap();
                    status.phase = "error".into();
                    status.error = Some(error);
                    eprintln!(
                        "[storage] Database startup failed elapsed_ms={}",
                        started.elapsed().as_millis()
                    );
                    return;
                }
            };
            {
                let mut status = worker_status.lock().unwrap();
                status.phase = "ready".into();
                status.persistence_ready = true;
            }
            eprintln!(
                "[storage] Database ready elapsed_ms={}",
                started.elapsed().as_millis()
            );
            let mut initialization = LibraryInitialization::start(loader, worker_status.clone());
            while let Some(request) = next_request(&receiver, || initialization.advance(&db)) {
                let request_started = std::time::Instant::now();
                // Review entry points consume library cards. Listening materials,
                // speech settings and AI profiles do not depend on the word seed.
                if let Some(error) = library_gate(&worker_status.lock().unwrap()) {
                    match request {
                        Request::Load(_, reply) | Request::Rate { reply, .. } => {
                            let _ = reply.send(Err(error));
                            continue;
                        }
                        _ => {}
                    }
                }
                match request {
                    Request::AiProfiles(operation, reply) => {
                        use crate::ai_profiles::ProfileOperation;
                        let result = match operation {
                            ProfileOperation::List => db.ai_profiles_list(),
                            ProfileOperation::Save(input) => {
                                db.ai_profile_save(input, keys.as_ref())
                            }
                            ProfileOperation::Delete(id) => db.ai_profile_delete(&id),
                            ProfileOperation::Activate(id) => db.ai_profile_activate(&id),
                            ProfileOperation::ResetCredentials(confirmed) => {
                                let result =
                                    db.ai_profiles_reset_credentials(confirmed, keys.as_ref());
                                if result.is_ok() {
                                    eprintln!("[ai-profiles] Confirmed credential recovery cleared all stored credentials");
                                }
                                result
                            }
                        };
                        // Never print error messages: native SQL errors may contain stored payloads.
                        match &result {
                            Ok(_) => eprintln!("[ai-profiles] Profile operation completed"),
                            Err(_) => eprintln!("[ai-profiles] Profile operation failed"),
                        }
                        let _ = reply.send(result);
                    }
                    Request::AiProfileResolve(id, reply) => {
                        match db.ai_profile_credential_snapshot(&id) {
                            Ok(snapshot) => {
                                let keys = keys.clone();
                                // No native handles cross threads. Only this selected
                                // profile's ciphertext/settings outlive the DB read.
                                tauri::async_runtime::spawn_blocking(move || {
                                    let started = std::time::Instant::now();
                                    let result = snapshot.resolve(keys.as_ref());
                                    eprintln!("[ai-profiles] Credential resolution completed success={} elapsed_ms={}", result.is_ok(), started.elapsed().as_millis());
                                    let _ = reply.send(result);
                                });
                            }
                            Err(error) => {
                                eprintln!("[ai-profiles] Credential snapshot failed");
                                let _ = reply.send(Err(error));
                            }
                        }
                    }
                    Request::SpeechEnhancedAvailable(available, reply) => {
                        let result = db.speech_enhanced_available(available, WallClock.now_ms());
                        if result.is_err() {
                            eprintln!("[speech] Enhanced voice cache operation failed");
                        }
                        let _ = reply.send(result);
                    }
                    Request::SpeechPreference(declined, reply) => {
                        let _ =
                            reply.send(db.speech_enhanced_declined(declined, WallClock.now_ms()));
                    }
                    Request::Listening(owner, operation, reply) => {
                        let _ = reply.send(db.listening(&owner, operation));
                    }
                    Request::Load(card, reply) => {
                        let _ = reply.send(db.ensure_card(&card, WallClock.now_ms()));
                    }
                    Request::Rate {
                        card,
                        event,
                        version,
                        rating,
                        reply,
                    } => {
                        let result = quicklang_application::rate_card(
                            &mut db, &WallClock, &event, &card, version, rating,
                        )
                        .map(|result| match result {
                            CommitResult::Applied(state) | CommitResult::AlreadyApplied(state) => {
                                state
                            }
                        });
                        let _ = reply.send(result);
                    }
                }
                eprintln!(
                    "[storage] Request completed elapsed_ms={}",
                    request_started.elapsed().as_millis()
                );
            }
        });
        Self { sender, status }
    }
    /// Persist or read the device-wide speech download decision on the storage worker.
    pub async fn speech_preference(&self, declined: Option<bool>) -> Result<bool, AppError> {
        let (reply, receiver) = mpsc::channel();
        self.sender
            .try_send(Request::SpeechPreference(declined, reply))
            .map_err(|_| unavailable())?;
        receive(receiver).await
    }
    /// Read/write confirmed installation without invoking native voice enumeration.
    pub async fn speech_enhanced_available(
        &self,
        available: Option<bool>,
    ) -> Result<bool, AppError> {
        let (reply, receiver) = mpsc::channel();
        self.sender
            .try_send(Request::SpeechEnhancedAvailable(available, reply))
            .map_err(|_| unavailable())?;
        receive(receiver).await
    }
    pub async fn listening(
        &self,
        owner: String,
        operation: quicklang_storage_seekdb::listening::ListeningRequest,
    ) -> Result<serde_json::Value, AppError> {
        let (reply, receiver) = mpsc::channel();
        self.sender
            .try_send(Request::Listening(owner, operation, reply))
            .map_err(|_| unavailable())?;
        receive(receiver).await
    }
    pub async fn ai_profiles(
        &self,
        operation: crate::ai_profiles::ProfileOperation,
    ) -> Result<quicklang_storage_seekdb::ai_profiles::ProfilesSnapshot, AppError> {
        let (reply, receiver) = mpsc::channel();
        self.sender
            .try_send(Request::AiProfiles(operation, reply))
            .map_err(|_| unavailable())?;
        receive(receiver).await
    }
    pub async fn ai_profile_resolve(
        &self,
        id: String,
    ) -> Result<quicklang_storage_seekdb::ai_profiles::ResolvedProfile, AppError> {
        let (reply, receiver) = mpsc::channel();
        self.sender
            .try_send(Request::AiProfileResolve(id, reply))
            .map_err(|_| unavailable())?;
        receive(receiver).await
    }
    pub fn status(&self) -> RuntimeStatus {
        self.status.lock().unwrap().clone()
    }
    pub async fn load(&self, card: String) -> Result<ReviewState, AppError> {
        let (reply, receiver) = mpsc::channel();
        self.sender
            .try_send(Request::Load(card, reply))
            .map_err(|_| unavailable())?;
        receive(receiver).await
    }
    pub async fn rate(
        &self,
        card: String,
        event: String,
        version: u64,
        rating: Rating,
    ) -> Result<ReviewState, AppError> {
        let (reply, receiver) = mpsc::channel();
        self.sender
            .try_send(Request::Rate {
                card,
                event,
                version,
                rating,
                reply,
            })
            .map_err(|_| unavailable())?;
        receive(receiver).await
    }
}
/// A single bounded import step per scheduling turn; never hold a library
/// transaction across dispatch. Idle validation polling does not busy-spin.
fn next_request<T>(receiver: &mpsc::Receiver<T>, mut advance: impl FnMut() -> bool) -> Option<T> {
    loop {
        let pending = advance();
        if !pending {
            return receiver.recv().ok();
        }
        match receiver.recv_timeout(std::time::Duration::from_millis(1)) {
            Ok(request) => return Some(request),
            Err(mpsc::RecvTimeoutError::Disconnected) => return None,
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
    }
}
fn library_gate(status: &RuntimeStatus) -> Option<AppError> {
    if status.library_ready {
        None
    } else if status.library_error.is_some() {
        Some(AppError::new(
            "LIBRARY_UNAVAILABLE",
            "Word library initialization failed",
            false,
        ))
    } else {
        Some(AppError::new(
            "LIBRARY_NOT_READY",
            "Word library is initializing",
            true,
        ))
    }
}
struct LibraryInitialization {
    seed: Option<
        mpsc::Receiver<Result<quicklang_storage_seekdb::word_library::LibrarySeed, AppError>>,
    >,
    import: Option<quicklang_storage_seekdb::word_library::LibraryImport>,
    status: Arc<Mutex<RuntimeStatus>>,
    started: std::time::Instant,
}
impl LibraryInitialization {
    fn start(
        loader: impl FnOnce() -> Result<quicklang_storage_seekdb::word_library::LibrarySeed, AppError>
            + Send
            + 'static,
        status: Arc<Mutex<RuntimeStatus>>,
    ) -> Self {
        let (sender, seed) = mpsc::channel();
        status.lock().unwrap().library_phase = "validating".into();
        std::thread::spawn(move || {
            let _ = sender.send(loader());
        });
        Self {
            seed: Some(seed),
            import: None,
            status,
            started: std::time::Instant::now(),
        }
    }
    fn finish(&mut self, result: Result<(), AppError>) {
        let mut status = self.status.lock().unwrap();
        status.library_ready = result.is_ok();
        status.library_phase = if result.is_ok() { "ready" } else { "error" }.into();
        // Native errors may echo SQL, so expose a safe library-specific error.
        status.library_error = result.err().map(|_| {
            AppError::new(
                "LIBRARY_UNAVAILABLE",
                "Word library validation or import failed",
                false,
            )
        });
        eprintln!(
            "[storage] Library finished success={} elapsed_ms={}",
            status.library_ready,
            self.started.elapsed().as_millis()
        );
        self.seed = None;
        self.import = None;
    }
    fn advance(&mut self, db: &SeekDbEmbeddedAdapter) -> bool {
        if let Some(seed) = &self.seed {
            match seed.try_recv() {
                Ok(Ok(seed)) => {
                    self.import = Some(quicklang_storage_seekdb::word_library::LibraryImport::new(
                        seed,
                    ));
                    self.seed = None;
                    self.status.lock().unwrap().library_phase = "importing".into();
                    return true;
                }
                Ok(Err(error)) => self.finish(Err(error)),
                Err(mpsc::TryRecvError::Empty) => return true,
                Err(mpsc::TryRecvError::Disconnected) => self.finish(Err(AppError::new(
                    "LIBRARY_UNAVAILABLE",
                    "Seed validator stopped",
                    false,
                ))),
            }
        }
        if let Some(import) = &mut self.import {
            let started = std::time::Instant::now();
            let result = import.step(db);
            eprintln!(
                "[storage] Library step completed success={} elapsed_ms={}",
                result.is_ok(),
                started.elapsed().as_millis()
            );
            match result {
                Ok(false) => return true,
                Ok(true) => self.finish(Ok(())),
                Err(error) => self.finish(Err(error)),
            }
        }
        false
    }
}
async fn receive<T: Send + 'static>(
    receiver: mpsc::Receiver<Result<T, AppError>>,
) -> Result<T, AppError> {
    tauri::async_runtime::spawn_blocking(move || receiver.recv().map_err(|_| unavailable())?)
        .await
        .map_err(|_| unavailable())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "requires real seekdb runtime"]
    fn pending_keychain_resolution_does_not_block_metadata_crud() {
        use crate::ai_profiles::ProfileOperation;
        use quicklang_storage_seekdb::ai_profiles::{KeyAction, MasterKeyStore, SaveProfileInput};
        struct BlockingKeys {
            blocked: std::sync::atomic::AtomicBool,
            entered: mpsc::Sender<()>,
            release: Mutex<mpsc::Receiver<()>>,
        }
        struct TestKeys(Arc<BlockingKeys>);
        impl std::ops::Deref for TestKeys {
            type Target = BlockingKeys;
            fn deref(&self) -> &BlockingKeys {
                &self.0
            }
        }
        impl MasterKeyStore for TestKeys {
            fn load(&self) -> Result<Option<Vec<u8>>, AppError> {
                if self.blocked.load(std::sync::atomic::Ordering::SeqCst) {
                    self.entered.send(()).unwrap();
                    self.release
                        .lock()
                        .unwrap()
                        .recv_timeout(std::time::Duration::from_secs(15))
                        .unwrap();
                    return Err(AppError::new("AI_KEYCHAIN_UNAVAILABLE", "Denied", false));
                }
                Ok(Some(vec![7; 32]))
            }
            fn create(&self, _: &[u8]) -> Result<(), AppError> {
                panic!("existing key")
            }
        }
        let (entered, pending) = mpsc::channel();
        let (release, resume) = mpsc::channel();
        let keys = Arc::new(BlockingKeys {
            blocked: std::sync::atomic::AtomicBool::new(false),
            entered,
            release: Mutex::new(resume),
        });
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        let service = StorageService::start_with_keys(
            root.join(format!(
                "build/test-databases/keychain-pending-{}-{}",
                std::process::id(),
                WallClock.now_ms()
            )),
            root.join("deps/cache/seekdb-runtime"),
            || Err(AppError::new("INVALID_LIBRARY", "fixture", false)),
            TestKeys(keys.clone()),
        );
        assert!(wait_for_startup(&service).persistence_ready);
        let saved = tauri::async_runtime::block_on(service.ai_profiles(ProfileOperation::Save(
            SaveProfileInput {
                id: None,
                name: "Secret probe".into(),
                base_url: "https://example.com/v1".into(),
                model: "test".into(),
                transcription_model: String::new(),
                key_action: KeyAction::Replace,
                api_key: Some("secret".into()),
            },
        )))
        .unwrap();
        let id = saved.profiles[0].id.clone();
        keys.blocked
            .store(true, std::sync::atomic::Ordering::SeqCst);
        let (reply, resolved) = mpsc::channel();
        service
            .sender
            .try_send(Request::AiProfileResolve(id.clone(), reply))
            .ok()
            .unwrap();
        pending
            .recv_timeout(std::time::Duration::from_secs(5))
            .unwrap();
        let dispatch = |operation| {
            let (reply, receiver) = mpsc::channel();
            service
                .sender
                .try_send(Request::AiProfiles(operation, reply))
                .ok()
                .unwrap();
            receiver
                .recv_timeout(std::time::Duration::from_secs(3))
                .expect("metadata blocked behind Keychain")
                .unwrap()
        };
        assert_eq!(dispatch(ProfileOperation::List).profiles.len(), 1);
        assert_eq!(
            dispatch(ProfileOperation::Save(SaveProfileInput {
                id: Some(id.clone()),
                name: "Edited while pending".into(),
                base_url: "https://example.com/v1".into(),
                model: "updated".into(),
                transcription_model: String::new(),
                key_action: KeyAction::Preserve,
                api_key: None,
            }))
            .profiles[0]
                .model,
            "updated"
        );
        assert!(dispatch(ProfileOperation::Delete(id)).profiles.is_empty());
        assert!(resolved.try_recv().is_err());
        release.send(()).unwrap();
        assert_eq!(
            resolved
                .recv_timeout(std::time::Duration::from_secs(5))
                .unwrap()
                .err()
                .unwrap()
                .code,
            "AI_KEYCHAIN_UNAVAILABLE"
        );
        assert!(dispatch(ProfileOperation::List).profiles.is_empty());
    }

    fn exercise_profile_crud(service: &StorageService) {
        use crate::ai_profiles::ProfileOperation;
        use quicklang_storage_seekdb::ai_profiles::{KeyAction, SaveProfileInput};
        let dispatch = |operation| {
            let (reply, receiver) = mpsc::channel();
            service
                .sender
                .try_send(Request::AiProfiles(operation, reply))
                .ok()
                .unwrap();
            receiver
                .recv_timeout(std::time::Duration::from_secs(5))
                .unwrap()
                .unwrap()
        };
        let saved = dispatch(ProfileOperation::Save(SaveProfileInput {
            id: None,
            name: "Readiness probe".into(),
            base_url: "https://example.com/v1".into(),
            model: "test-model".into(),
            transcription_model: String::new(),
            key_action: KeyAction::Clear,
            api_key: None,
        }));
        let id = saved.profiles[0].id.clone();
        assert_eq!(dispatch(ProfileOperation::List).profiles.len(), 1);
        assert_eq!(
            dispatch(ProfileOperation::Activate(id.clone()))
                .active_id
                .as_deref(),
            Some(id.as_str())
        );
        let updated = dispatch(ProfileOperation::Save(SaveProfileInput {
            id: Some(id.clone()),
            name: "Updated probe".into(),
            base_url: "https://example.com/v1".into(),
            model: "updated-model".into(),
            transcription_model: String::new(),
            key_action: KeyAction::Preserve,
            api_key: None,
        }));
        assert_eq!(updated.profiles[0].model, "updated-model");
        assert!(dispatch(ProfileOperation::Delete(id)).profiles.is_empty());
    }

    #[test]
    fn scheduler_dispatches_before_library_completion_and_after_error() {
        let (sender, receiver) = mpsc::channel();
        sender.send("config-save").unwrap();
        let mut steps = 0;
        assert_eq!(
            next_request(&receiver, || {
                steps += 1;
                true
            }),
            Some("config-save")
        );
        assert_eq!(steps, 1, "An incomplete library must yield after one step");
        sender.send("config-read").unwrap();
        assert_eq!(next_request(&receiver, || false), Some("config-read"));
        drop(sender);
        assert_eq!(next_request(&receiver, || true), None);
    }

    #[test]
    #[ignore = "requires real seekdb runtime"]
    fn configuration_is_processed_while_validation_is_incomplete() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        let directory = root.join(format!(
            "build/test-databases/config-pending-{}-{}",
            std::process::id(),
            WallClock.now_ms()
        ));
        let (release, blocked) = mpsc::channel();
        let service = StorageService::start_with_loader(
            directory,
            root.join("deps/cache/seekdb-runtime"),
            move || {
                blocked
                    .recv_timeout(std::time::Duration::from_secs(20))
                    .unwrap();
                Err(AppError::new("INVALID_LIBRARY", "fixture error", false))
            },
        );
        assert!(wait_for_startup(&service).persistence_ready);
        let (reply, result) = mpsc::channel();
        service
            .sender
            .try_send(Request::SpeechPreference(Some(true), reply))
            .ok()
            .unwrap();
        assert!(result
            .recv_timeout(std::time::Duration::from_secs(5))
            .unwrap()
            .unwrap());
        assert!(!service.status().library_ready);
        exercise_profile_crud(&service);
        let error = tauri::async_runtime::block_on(service.load("card".into())).unwrap_err();
        assert_eq!(error.code, "LIBRARY_NOT_READY");
        release.send(()).unwrap();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        while service.status().library_phase != "error" {
            assert!(std::time::Instant::now() < deadline);
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        assert!(service.status().persistence_ready);
        assert!(service.status().error.is_none());
        exercise_profile_crud(&service);
        assert!(tauri::async_runtime::block_on(service.speech_preference(None)).unwrap());
        assert_eq!(
            tauri::async_runtime::block_on(service.load("card".into()))
                .unwrap_err()
                .code,
            "LIBRARY_UNAVAILABLE"
        );
    }

    /// Wait for the real storage worker to finish startup, bounded to three minutes.
    fn wait_for_startup(service: &StorageService) -> RuntimeStatus {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(180);
        loop {
            let status = service.status();
            if status.phase != "starting" {
                return status;
            }
            assert!(
                std::time::Instant::now() < deadline,
                "Storage startup timed out"
            );
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
    }

    #[test]
    #[ignore = "requires real seekdb runtime"]
    fn configuration_survives_invalid_library() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        let directory = root.join(format!(
            "build/test-databases/config-ready-{}-{}",
            std::process::id(),
            WallClock.now_ms()
        ));
        let service = StorageService::start(
            directory,
            root.join("deps/cache/seekdb-runtime"),
            root.join("missing-library"),
        );
        let status = wait_for_startup(&service);
        assert!(
            status.persistence_ready,
            "Base database must remain available without a library"
        );
        assert!(tauri::async_runtime::block_on(service.speech_preference(Some(true))).unwrap());
        assert!(tauri::async_runtime::block_on(service.speech_preference(None)).unwrap());
    }

    /// Base readiness precedes library readiness; a missing seed only fails the latter.
    #[test]
    #[ignore = "requires real seekdb and generated seed"]
    fn startup_separates_database_and_library_readiness() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        let directory = root.join(format!(
            "build/test-databases/startup-{}-{}",
            std::process::id(),
            WallClock.now_ms()
        ));
        let runtime = root.join("deps/cache/seekdb-runtime");
        let service = StorageService::start(
            directory.clone(),
            runtime.clone(),
            root.join("build/content/word-library"),
        );
        let status = wait_for_startup(&service);
        assert!(status.persistence_ready, "{:?}", status.error);
        assert_eq!(status.phase, "ready");
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(180);
        while !service.status().library_ready {
            let status = service.status();
            assert!(status.library_error.is_none());
            assert!(std::time::Instant::now() < deadline);
            // Exercise real request dispatch throughout validation and native import.
            let (reply, receiver) = mpsc::channel();
            service
                .sender
                .try_send(Request::SpeechPreference(Some(true), reply))
                .ok()
                .unwrap();
            assert!(receiver
                .recv_timeout(std::time::Duration::from_secs(5))
                .unwrap()
                .unwrap());
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        let failed = StorageService::start(
            directory.with_extension("missing-seed"),
            runtime,
            root.join("missing-library"),
        );
        let status = wait_for_startup(&failed);
        assert_eq!(status.phase, "ready");
        assert!(status.persistence_ready);
        assert!(status.error.is_none());
    }

    #[test]
    fn failed_startup_is_not_reported_ready() {
        let service = StorageService::start(
            PathBuf::from("unused"),
            PathBuf::from("missing-runtime"),
            PathBuf::from("missing-library"),
        );
        let error = tauri::async_runtime::block_on(service.load("a".into())).unwrap_err();
        assert_eq!(error.code, "DB_UNAVAILABLE");
        let status = service.status();
        assert_eq!(status.phase, "error");
        assert!(!status.persistence_ready);
        assert!(status.error.is_some());
    }
    #[test]
    fn disconnected_and_full_workers_return_retryable_errors() {
        let service = StorageService::start(
            PathBuf::from("unused"),
            PathBuf::from("missing-runtime"),
            PathBuf::from("missing-library"),
        );
        let _ = tauri::async_runtime::block_on(service.load("a".into()));
        let error = tauri::async_runtime::block_on(service.rate(
            "a".into(),
            "event".into(),
            0,
            Rating::Good,
        ))
        .unwrap_err();
        assert_eq!(error.code, "DB_UNAVAILABLE");
        assert!(tauri::async_runtime::block_on(service.listening(
            "alice".into(),
            quicklang_storage_seekdb::listening::ListeningRequest::List
        ))
        .is_err());
        let (sender, _receiver) = mpsc::sync_channel(0);
        let full = StorageService {
            sender,
            status: service.status.clone(),
        };
        assert_eq!(
            tauri::async_runtime::block_on(full.load("a".into()))
                .unwrap_err()
                .code,
            "DB_UNAVAILABLE"
        );
    }
    #[test]
    fn receives_success_errors_and_disconnected_replies() {
        let (sender, receiver) = mpsc::channel();
        sender.send(Ok(42)).unwrap();
        assert_eq!(
            tauri::async_runtime::block_on(receive(receiver)).unwrap(),
            42
        );
        let (sender, receiver) = mpsc::channel();
        sender
            .send(Err::<(), _>(AppError::new("SESSION_STALE", "stale", true)))
            .unwrap();
        assert_eq!(
            tauri::async_runtime::block_on(receive(receiver))
                .unwrap_err()
                .code,
            "SESSION_STALE"
        );
        let (sender, receiver) = mpsc::channel::<Result<(), AppError>>();
        drop(sender);
        assert_eq!(
            tauri::async_runtime::block_on(receive(receiver))
                .unwrap_err()
                .code,
            "DB_UNAVAILABLE"
        );
        assert!(WallClock.now_ms() > 0);
    }
}
