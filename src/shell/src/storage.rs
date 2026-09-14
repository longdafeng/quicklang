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
}
type Reply = mpsc::Sender<Result<ReviewState, AppError>>;
enum Request {
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
    /// Start storage on its owning thread; report ready only after the library is complete.
    pub fn start(data: PathBuf, runtime: PathBuf, library: PathBuf) -> Self {
        let (sender, receiver) = mpsc::sync_channel(32);
        let status = Arc::new(Mutex::new(RuntimeStatus {
            phase: "starting".into(),
            storage: "seekdb_1.4.0".into(),
            persistence_ready: false,
            error: None,
        }));
        let worker_status = status.clone();
        std::thread::spawn(move || {
            let opened = SeekDbEmbeddedAdapter::open_with_runtime(&data, &runtime).and_then(|db| {
                db.ensure_library(&library)?;
                Ok(db)
            });
            let mut db = match opened {
                Ok(db) => db,
                Err(error) => {
                    let mut status = worker_status.lock().unwrap();
                    status.phase = "error".into();
                    status.error = Some(error);
                    return;
                }
            };
            {
                let mut status = worker_status.lock().unwrap();
                status.phase = "ready".into();
                status.persistence_ready = true;
            }
            for request in receiver {
                match request {
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
            }
        });
        Self { sender, status }
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

    /// Verify that real startup reports readiness only with a valid bundled library.
    #[test]
    #[ignore = "requires real seekdb and generated seed"]
    fn startup_requires_complete_library() {
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
        let failed = StorageService::start(
            directory.with_extension("missing-seed"),
            runtime,
            root.join("missing-library"),
        );
        let status = wait_for_startup(&failed);
        assert_eq!(status.phase, "error");
        assert!(!status.persistence_ready);
        assert!(status.error.is_some());
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
