use quicklang_storage_seekdb::{word_library::LibrarySeed, SeekDbEmbeddedAdapter};
use std::path::PathBuf;
fn main() {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if let Err(error) = run(&args) {
        eprintln!("Word library init failed: {error:?}");
        std::process::exit(1);
    }
}
fn run(args: &[std::ffi::OsString]) -> Result<(), Box<dyn std::error::Error>> {
    if args.len() != 3 {
        return Err(
            "Usage: init-word-library <seed-directory> <database-directory> <runtime-directory>"
                .into(),
        );
    }
    let seed = LibrarySeed::load(&PathBuf::from(&args[0]))?;
    let data = PathBuf::from(&args[1]);
    let db = SeekDbEmbeddedAdapter::open_with_runtime(&data, &PathBuf::from(&args[2]))?;
    let report = db.import_library(&seed)?;
    println!("Database: {}", data.display());
    println!("{}", serde_json::to_string(&report)?);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn requires_exactly_three_paths() {
        for count in [0, 1, 2, 4] {
            let args = vec![std::ffi::OsString::from("unused"); count];
            assert!(run(&args).unwrap_err().to_string().contains("Usage:"));
        }
    }
    #[test]
    fn invalid_seed_fails_before_database_initialization() {
        let args = [
            "/quicklang-test-nonexistent-seed".into(),
            "unused-db".into(),
            "unused-runtime".into(),
        ];
        assert!(run(&args).is_err());
    }
}
