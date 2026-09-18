//! seekdb 1.4 embedded adapter: native driver, local socket, atomic review writes.
pub mod ai_profiles;
pub mod listening;
mod speech_preferences;
mod native;
pub mod word_library;
use fs2::FileExt;
use native::{error, Native};
use quicklang_domain::{AppError, ReviewEvent, ReviewState};
use quicklang_storage_port::{CommitResult, ReviewRepository};
use serde::{de::DeserializeOwned, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    path::{Path, PathBuf},
};
pub const ENGINE_VERSION: &str = "1.4.0";
const MIGRATIONS: &[(u64, &str)] = &[
    (
        2,
        include_str!("../../../migrations/embedded/V0002__native_reviews.sql"),
    ),
    (
        3,
        include_str!("../../../migrations/embedded/V0003__word_library.sql"),
    ),
    (
        4,
        include_str!("../../../migrations/embedded/V0004__listening.sql"),
    ),
    (
        5,
        include_str!("../../../migrations/embedded/V0005__ai_profiles.sql"),
    ),
];
pub struct SeekDbEmbeddedAdapter {
    native: Native,
    _lock: File,
}
impl SeekDbEmbeddedAdapter {
    pub fn open(data_dir: &Path) -> Result<Self, AppError> {
        let runtime = std::env::var_os("QUICKLANG_SEEKDB_RUNTIME")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../deps/cache/seekdb-runtime")
            });
        Self::open_with_runtime(data_dir, &runtime)
    }
    pub fn open_with_runtime(data_dir: &Path, runtime: &Path) -> Result<Self, AppError> {
        if !cfg!(all(target_os = "macos", target_arch = "aarch64")) {
            return Err(error(
                "UNSUPPORTED_PLATFORM",
                "Embedded runtime supports macOS ARM64 only",
            ));
        }
        if !runtime.join("libseekdb.dylib").is_file() || !runtime.join("seekdb").is_file() {
            return Err(error(
                "DB_RUNTIME_MISSING",
                "Run make init to prepare the pinned seekdb runtime",
            ));
        }
        if data_dir.is_symlink() {
            return Err(error(
                "INVALID_PATH",
                "Database directory cannot be a symlink",
            ));
        }
        fs::create_dir_all(data_dir).map_err(io_error)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(data_dir, fs::Permissions::from_mode(0o700)).map_err(io_error)?;
        }
        let lock = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(data_dir.join("quicklang.lock"))
            .map_err(io_error)?;
        lock.try_lock_exclusive().map_err(|_| {
            AppError::new(
                "DB_LOCKED",
                "Another QuickLang process is using this database",
                true,
            )
        })?;
        let marker = data_dir.join("quicklang-engine-version");
        if marker.exists() {
            if fs::read_to_string(&marker).map_err(io_error)?.trim() != ENGINE_VERSION {
                return Err(error(
                    "MIGRATION_REQUIRED",
                    "Engine changed; logical migration required",
                ));
            }
        } else if fs::read_dir(data_dir).map_err(io_error)?.any(|entry| {
            entry
                .map(|e| e.file_name() != "quicklang.lock")
                .unwrap_or(true)
        }) {
            return Err(error(
                "MIGRATION_REQUIRED",
                "Refusing in-place initialization of an unrecognized database",
            ));
        } else {
            fs::write(&marker, format!("{ENGINE_VERSION}\n")).map_err(io_error)?;
        }
        let native = Native::open(&fs::canonicalize(data_dir).map_err(io_error)?, runtime)?;
        let db = Self {
            native,
            _lock: lock,
        };
        if !db.engine_version()?.contains("seekdb-v1.4.0.") {
            return Err(error(
                "DB_VERSION_MISMATCH",
                "Loaded engine does not match pinned seekdb version",
            ));
        }
        db.migrate()?;
        Ok(db)
    }
    fn migrate(&self) -> Result<(), AppError> {
        // Avoid redundant DDL on reopen: seekdb can stall even with IF NOT EXISTS.
        // The adapter's database file lock serializes schema initialization.
        let journal = self.native.execute(
            "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ql_schema_migration'",
        )?;
        if journal.is_empty() {
            self.native.execute("CREATE TABLE IF NOT EXISTS ql_schema_migration (version BIGINT PRIMARY KEY, checksum VARCHAR(64) NOT NULL)")?;
        }
        let rows = self
            .native
            .execute("SELECT version, checksum FROM ql_schema_migration ORDER BY version")?;
        if rows.len() > MIGRATIONS.len() {
            return Err(error("MIGRATION_REQUIRED", "Unknown schema migration"));
        }
        for (index, row) in rows.iter().enumerate() {
            let (version, sql) = MIGRATIONS[index];
            let checksum = format!("{:x}", Sha256::digest(sql.as_bytes()));
            if row[0].as_deref() != Some(&version.to_string())
                || row[1].as_deref() != Some(&checksum)
            {
                return Err(error(
                    "MIGRATION_REQUIRED",
                    "Unknown or modified schema migration",
                ));
            }
        }
        // MySQL DDL auto-commits. Journal only after all restart-safe statements succeed.
        for (version, sql) in &MIGRATIONS[rows.len()..] {
            let checksum = format!("{:x}", Sha256::digest(sql.as_bytes()));
            let sql = sql
                .lines()
                .filter(|line| !line.trim_start().starts_with("--"))
                .collect::<Vec<_>>()
                .join("\n");
            for statement in sql.split(';').map(str::trim).filter(|s| !s.is_empty()) {
                self.native.execute(statement)?;
            }
            self.native.execute(&format!(
                "INSERT INTO ql_schema_migration VALUES ({version},{})",
                literal(&checksum)
            ))?;
        }
        Ok(())
    }
    pub fn engine_version(&self) -> Result<String, AppError> {
        self.native
            .execute("SELECT VERSION()")?
            .first()
            .and_then(|r| r.first())
            .and_then(Clone::clone)
            .ok_or_else(|| error("DB_INVALID_RESULT", "Missing engine version"))
    }
    pub fn ensure_card(&self, id: &str, now: i64) -> Result<ReviewState, AppError> {
        validate_id(id)?;
        if now < 0 {
            return Err(error("INVALID_INPUT", "Invalid time"));
        }
        let state = ReviewState::new(id, now);
        self.native.execute(&format!(
            "INSERT IGNORE INTO ql_review_state (card_id,version,payload) VALUES ({},0,{})",
            literal(id),
            json_literal(&state)?
        ))?;
        self.load(id)
    }
    fn load_locked(&self, id: &str, locked: bool) -> Result<ReviewState, AppError> {
        validate_id(id)?;
        decode_row(&self.native.execute(&format!(
            "SELECT payload FROM ql_review_state WHERE card_id={}{}",
            literal(id),
            if locked { " FOR UPDATE" } else { "" }
        ))?)?
        .ok_or_else(|| error("NOT_FOUND", "Card does not exist"))
    }
}
impl ReviewRepository for SeekDbEmbeddedAdapter {
    fn load(&self, id: &str) -> Result<ReviewState, AppError> {
        self.load_locked(id, false)
    }
    fn find_event(&self, id: &str) -> Result<Option<ReviewEvent>, AppError> {
        validate_id(id)?;
        decode_row(&self.native.execute(&format!(
            "SELECT payload FROM ql_review_event WHERE event_id={}",
            literal(id)
        ))?)
    }
    fn commit(
        &mut self,
        expected_version: u64,
        event: ReviewEvent,
        next: ReviewState,
    ) -> Result<CommitResult, AppError> {
        validate_id(&event.id)?;
        validate_id(&event.card_id)?;
        if next.card_id != event.card_id
            || Some(next.version) != expected_version.checked_add(1)
            || !next.ease.is_finite()
            || event.reviewed_at < 0
        {
            return Err(error("INVALID_REVIEW", "Event and state do not match"));
        }
        self.native.transaction(|| {
            let current = self.load_locked(&event.card_id, true)?;
            if let Some(existing) = self.find_event(&event.id)? {
                return if existing == event {
                    Ok(CommitResult::AlreadyApplied(current))
                } else {
                    Err(error(
                        "EVENT_CONFLICT",
                        "Event ID reused with different content",
                    ))
                };
            }
            if current.version != expected_version {
                return Err(AppError::new("SESSION_STALE", "Review state changed", true));
            }
            self.native.execute(&format!(
                "INSERT INTO ql_review_event (event_id,card_id,payload) VALUES ({},{},{})",
                literal(&event.id),
                literal(&event.card_id),
                json_literal(&event)?
            ))?;
            self.native.execute(&format!(
                "UPDATE ql_review_state SET version={},payload={} WHERE card_id={} AND version={}",
                next.version,
                json_literal(&next)?,
                literal(&next.card_id),
                expected_version
            ))?;
            Ok(CommitResult::Applied(next.clone()))
        })
    }
}
fn validate_id(id: &str) -> Result<(), AppError> {
    if id.is_empty() || id.len() > 128 || id.chars().any(char::is_control) {
        return Err(error("INVALID_INPUT", "Invalid identifier"));
    }
    Ok(())
}
fn literal(text: &str) -> String {
    // C API has no parameter binding; UTF-8 hex literals are safe across SQL modes.
    let hex: String = text.as_bytes().iter().map(|b| format!("{b:02x}")).collect();
    format!("CONVERT(X'{hex}' USING utf8mb4)")
}
fn json_literal(value: &impl Serialize) -> Result<String, AppError> {
    serde_json::to_string(value)
        .map(|s| literal(&s))
        .map_err(|_| error("INVALID_REVIEW", "Invalid JSON state"))
}
fn decode_row<T: DeserializeOwned>(rows: &[Vec<Option<String>>]) -> Result<Option<T>, AppError> {
    rows.first()
        .map(|row| {
            let json = row
                .first()
                .and_then(Option::as_deref)
                .ok_or_else(|| error("DB_INVALID_RESULT", "Missing payload"))?;
            serde_json::from_str(json)
                .map_err(|_| error("DB_INVALID_RESULT", "Stored payload does not match schema"))
        })
        .transpose()
}
fn io_error(e: std::io::Error) -> AppError {
    error("DB_IO_FAILED", &e.to_string())
}

#[cfg(test)]
mod unit_tests {
    use super::*;
    #[test]
    fn identifiers_enforce_byte_and_control_limits() {
        for id in ["", "a\0b", "a\nb", &"a".repeat(129), &"中".repeat(43)] {
            assert_eq!(validate_id(id).unwrap_err().code, "INVALID_INPUT");
        }
        for id in ["a", "quote'\\中文", &"a".repeat(128)] {
            validate_id(id).unwrap();
        }
    }
    #[test]
    fn sql_literals_encode_utf8_and_metacharacters_as_data() {
        assert_eq!(literal(""), "CONVERT(X'' USING utf8mb4)");
        assert_eq!(literal("'\\\0中"), "CONVERT(X'275c00e4b8ad' USING utf8mb4)");
        let state = ReviewState::new("quoted'中", 42);
        assert_eq!(
            json_literal(&state).unwrap(),
            literal(&serde_json::to_string(&state).unwrap())
        );
    }
    #[test]
    fn row_decoder_distinguishes_absence_from_corruption() {
        assert!(decode_row::<ReviewState>(&[]).unwrap().is_none());
        for row in [
            vec![],
            vec![None],
            vec![Some("invalid".into())],
            vec![Some("{}".into())],
        ] {
            assert_eq!(
                decode_row::<ReviewState>(&[row]).unwrap_err().code,
                "DB_INVALID_RESULT"
            );
        }
        let state = ReviewState::new("a", 123);
        let rows = vec![vec![Some(serde_json::to_string(&state).unwrap())]];
        assert_eq!(decode_row::<ReviewState>(&rows).unwrap(), Some(state));
    }
}
