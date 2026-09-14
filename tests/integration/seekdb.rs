use quicklang_domain::Rating;
use quicklang_storage_port::{Clock, ReviewRepository};
use quicklang_storage_seekdb::SeekDbEmbeddedAdapter;
use std::{
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
#[path = "../../src/crates/storage-seekdb/src/native.rs"]
mod native;
struct FixedClock;
impl Clock for FixedClock {
    fn now_ms(&self) -> i64 {
        1_800_000_000_000
    }
}

#[test]
#[ignore = "requires real macOS ARM64 seekdb runtime; run make test-db"]
fn embedded_persistence_and_atomicity() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let runtime = std::env::var_os("QUICKLANG_TEST_RUNTIME")
        .map(PathBuf::from)
        .unwrap_or_else(|| root.join("deps/cache/seekdb-runtime"));
    let id = "word'\\中文; DROP TABLE ql_review_state;--";
    if let Some(path) = std::env::var_os("QUICKLANG_REOPEN_PROBE") {
        let mut db =
            SeekDbEmbeddedAdapter::open_with_runtime(&PathBuf::from(path), &runtime).unwrap();
        assert_eq!(db.load(id).unwrap().version, 1);
        assert!(db.find_event("event-1").unwrap().is_some());
        quicklang_application::rate_card(&mut db, &FixedClock, "child-event", id, 1, Rating::Good)
            .unwrap();
        return;
    }
    let data = root.join(format!(
        "build/test-databases/seekdb-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis()
    ));
    eprintln!("Test database retained at {}", data.display());
    let mut db = SeekDbEmbeddedAdapter::open_with_runtime(&data, &runtime).unwrap();
    eprintln!("Engine: {}", db.engine_version().unwrap());
    assert_eq!(
        SeekDbEmbeddedAdapter::open_with_runtime(&data, &runtime)
            .err()
            .unwrap()
            .code,
        "DB_LOCKED"
    );
    assert_eq!(db.ensure_card(id, 0).unwrap().version, 0);
    quicklang_application::rate_card(&mut db, &FixedClock, "event-1", id, 0, Rating::Good).unwrap();
    assert_eq!(db.load(id).unwrap().version, 1);
    assert_eq!(
        quicklang_application::rate_card(&mut db, &FixedClock, "event-1", id, 0, Rating::Easy)
            .unwrap_err()
            .code,
        "EVENT_CONFLICT"
    );
    quicklang_application::rate_card(&mut db, &FixedClock, "event-1", id, 0, Rating::Good).unwrap();
    assert_eq!(db.load(id).unwrap().version, 1);
    assert_eq!(
        quicklang_application::rate_card(&mut db, &FixedClock, "event-2", id, 0, Rating::Good)
            .unwrap_err()
            .code,
        "SESSION_STALE"
    );
    assert!(db.find_event("event-2").unwrap().is_none());
    drop(db);
    let db = SeekDbEmbeddedAdapter::open_with_runtime(&data, &runtime).unwrap();
    assert_eq!(db.ensure_card(id, 0).unwrap().version, 1);
    assert!(db.find_event("event-1").unwrap().is_some());
    drop(db);
    let native = native::Native::open(&data.canonicalize().unwrap(), &runtime).unwrap();
    native
        .execute("CREATE TABLE ql_rollback_probe (id INT PRIMARY KEY)")
        .unwrap();
    let failed = native.transaction(|| {
        native.execute("INSERT INTO ql_rollback_probe VALUES (1)")?;
        native.execute("INSERT INTO definitely_missing_table VALUES (1)")?;
        Ok(())
    });
    assert!(failed.is_err());
    assert!(native
        .execute("SELECT id FROM ql_rollback_probe")
        .unwrap()
        .is_empty());
    drop(native);
    let child = std::process::Command::new(std::env::current_exe().unwrap())
        .args([
            "--ignored",
            "--exact",
            "embedded_persistence_and_atomicity",
            "--nocapture",
        ])
        .env("QUICKLANG_REOPEN_PROBE", &data)
        .output()
        .unwrap();
    assert!(
        child.status.success(),
        "Child failed: {}",
        String::from_utf8_lossy(&child.stderr)
    );
    let db = SeekDbEmbeddedAdapter::open_with_runtime(&data, &runtime).unwrap();
    assert_eq!(db.load(id).unwrap().version, 2);
    assert!(db.find_event("child-event").unwrap().is_some());
    drop(db);
    let native = native::Native::open(&data.canonicalize().unwrap(), &runtime).unwrap();
    native
        .execute("UPDATE ql_schema_migration SET checksum='tampered'")
        .unwrap();
    drop(native);
    assert_eq!(
        SeekDbEmbeddedAdapter::open_with_runtime(&data, &runtime)
            .err()
            .unwrap()
            .code,
        "MIGRATION_REQUIRED"
    );
    std::fs::write(data.join("quicklang-engine-version"), "1.3.0\n").unwrap();
    assert_eq!(
        SeekDbEmbeddedAdapter::open_with_runtime(&data, &runtime)
            .err()
            .unwrap()
            .code,
        "MIGRATION_REQUIRED"
    );
}
