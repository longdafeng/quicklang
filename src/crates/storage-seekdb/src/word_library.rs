//! Verified, insert-only offline seed import. Existing user data is never replaced.
use super::{error, io_error, literal, SeekDbEmbeddedAdapter};
use quicklang_domain::AppError;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashSet},
    fs,
    path::Path,
};

const COLUMNS: &[&str] = &[
    "spelling",
    "language",
    "meaning",
    "phonetic_us",
    "phonetic_uk",
    "example",
    "example_translation",
    "example_source",
    "example_license",
    "example_generated",
    "extra_examples",
    "definition_source",
    "source_url",
    "source_revision",
    "license_spdx",
    "attribution",
    "original_spelling",
    "original_meaning",
    "user_modified",
    "version",
    "created_at",
    "updated_at",
];
#[derive(Deserialize)]
struct Manifest {
    schema_version: u32,
    format: String,
    files: BTreeMap<String, String>,
    words: usize,
    wordbooks: usize,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Book {
    id: String,
    title: String,
    words: Vec<String>,
}
pub struct LibrarySeed {
    words: Vec<Value>,
    books: Vec<Book>,
}
#[derive(Debug, Serialize)]
pub struct ImportReport {
    pub inserted_words: usize,
    pub inserted_books: usize,
    pub preserved_words: usize,
    pub preserved_books: usize,
}
fn invalid(message: &str) -> AppError {
    error("INVALID_LIBRARY", message)
}
fn text(value: &Value, name: &str) -> Result<String, AppError> {
    value
        .get(name)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| invalid(&format!("Missing text column {name}")))
}
fn valid_key(key: &str, max: usize) -> bool {
    !key.is_empty()
        && key.trim() == key
        && key.chars().count() <= max
        && !key.chars().any(char::is_control)
}
impl LibrarySeed {
    pub fn load(directory: &Path) -> Result<Self, AppError> {
        let manifest: Manifest =
            serde_json::from_slice(&fs::read(directory.join("manifest.json")).map_err(io_error)?)
                .map_err(|e| invalid(&e.to_string()))?;
        if manifest.schema_version != 3 || manifest.format != "quicklang-word-library-v1" {
            return Err(invalid("Unsupported seed format"));
        }
        let allowed = [
            "words.jsonl",
            "wordbooks.jsonl",
            "legacy-map.jsonl",
            "merge-conflicts.jsonl",
            "LICENSE",
            "ATTRIBUTION.md",
            "source-manifest.json",
        ];
        if manifest.files.len() != allowed.len()
            || allowed
                .iter()
                .any(|name| !manifest.files.contains_key(*name))
        {
            return Err(invalid("Incomplete seed manifest"));
        }
        let mut files = BTreeMap::new();
        for (name, checksum) in manifest.files {
            let bytes = fs::read(directory.join(&name)).map_err(io_error)?;
            if format!("{:x}", Sha256::digest(&bytes)) != checksum {
                return Err(invalid(&format!("Checksum mismatch: {name}")));
            }
            files.insert(name, bytes);
        }
        let parse_lines = |name: &str| -> Result<Vec<Value>, AppError> {
            std::str::from_utf8(&files[name])
                .map_err(|e| invalid(&e.to_string()))?
                .lines()
                .map(|line| serde_json::from_str(line).map_err(|e| invalid(&e.to_string())))
                .collect()
        };
        let words = parse_lines("words.jsonl")?;
        let books = parse_lines("wordbooks.jsonl")?
            .into_iter()
            .map(|v| serde_json::from_value(v).map_err(|e| invalid(&e.to_string())))
            .collect::<Result<Vec<Book>, _>>()?;
        if words.len() != manifest.words
            || books.len() != manifest.wordbooks
            || words.is_empty()
            || books.is_empty()
        {
            return Err(invalid("Seed counts mismatch or empty library"));
        }
        let mut spellings = HashSet::new();
        for word in &words {
            let spelling = text(word, "spelling")?;
            if !valid_key(&spelling, 256) || !spellings.insert(spelling) {
                return Err(invalid("Invalid or duplicate spelling"));
            }
            // Validate every column before opening the database, including fixed lengths.
            word_values(word)?;
        }
        let mut ids = HashSet::new();
        for book in &books {
            if !valid_key(&book.id, 128)
                || !ids.insert(&book.id)
                || book.title.trim().is_empty()
                || book.title.chars().count() > 256
            {
                return Err(invalid("Invalid or duplicate book"));
            }
            let mut seen = HashSet::new();
            for spelling in &book.words {
                if !spellings.contains(spelling) || !seen.insert(spelling) {
                    return Err(invalid("Missing or duplicate book member"));
                }
            }
        }
        Ok(Self { words, books })
    }
}
fn word_values(word: &Value) -> Result<String, AppError> {
    let object = word
        .as_object()
        .ok_or_else(|| invalid("Invalid word row"))?;
    if object.len() != COLUMNS.len() {
        return Err(invalid("Unexpected word columns"));
    }
    COLUMNS
        .iter()
        .map(|&column| {
            let value = object
                .get(column)
                .ok_or_else(|| invalid("Missing word column"))?;
            match column {
                "example_generated" | "user_modified" => value
                    .as_bool()
                    .map(|v| if v { "TRUE" } else { "FALSE" }.into())
                    .ok_or_else(|| invalid("Invalid boolean")),
                "version" | "created_at" | "updated_at" => value
                    .as_i64()
                    .filter(|v| *v >= if column == "version" { 1 } else { 0 })
                    .map(|v| v.to_string())
                    .ok_or_else(|| invalid("Invalid version/time")),
                "extra_examples" => {
                    if value.is_null() {
                        return Ok("NULL".into());
                    }
                    let examples = value
                        .as_array()
                        .ok_or_else(|| invalid("Invalid extra examples"))?;
                    for example in examples {
                        if text(example, "textEn")?.trim().is_empty()
                            || text(example, "textZh")?.trim().is_empty()
                        {
                            return Err(invalid("Incomplete extra example"));
                        }
                    }
                    Ok(literal(&value.to_string()))
                }
                _ => {
                    let required = [
                        "spelling",
                        "language",
                        "meaning",
                        "example",
                        "example_translation",
                    ]
                    .contains(&column);
                    if value.is_null() && !required {
                        return Ok("NULL".into());
                    }
                    let content = value
                        .as_str()
                        .ok_or_else(|| invalid("Invalid text value"))?;
                    let limit = match column {
                        "language" => 16,
                        "example_license" | "license_spdx" => 64,
                        "source_revision" => 128,
                        "spelling" | "phonetic_us" | "phonetic_uk" | "example_source"
                        | "definition_source" | "original_spelling" => 256,
                        _ => usize::MAX,
                    };
                    if (required && content.trim().is_empty())
                        || content.chars().count() > limit
                        || (limit == usize::MAX && column != "attribution" && content.len() > 65535)
                    {
                        return Err(invalid(&format!("Empty or oversized {column}")));
                    }
                    Ok(literal(content))
                }
            }
        })
        .collect::<Result<Vec<_>, _>>()
        .map(|v| format!("({})", v.join(",")))
}
// Native ARRAY display is not JSON-escaped. Use a separator forbidden in spelling keys.
fn array_literal(words: &[String]) -> String {
    literal(&serde_json::to_string(words).expect("String arrays serialize"))
}
fn decode_array(value: Option<&str>) -> Result<Vec<String>, AppError> {
    let value = value.ok_or_else(|| invalid("Missing stored array"))?;
    if value.is_empty() {
        return Ok(Vec::new());
    }
    let words: Vec<String> = value.split('\u{1f}').map(str::to_owned).collect();
    if words.iter().any(|word| !valid_key(word, 256)) {
        return Err(invalid("Invalid stored array member"));
    }
    Ok(words)
}
impl SeekDbEmbeddedAdapter {
    /// Verify the bundled seed, recreate missing library tables, and insert missing rows.
    /// Existing rows remain unchanged; invalid resources or database failures prevent readiness.
    pub fn ensure_library(&self, directory: &Path) -> Result<ImportReport, AppError> {
        let seed = LibrarySeed::load(directory)?;
        let tables: HashSet<String> = self.native.execute(
            "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('ql_word','wordbook')",
        )?.into_iter().filter_map(|row| row.into_iter().next().flatten()).collect();
        // Only issue DDL for absent tables; redundant seekdb DDL can stall on reopen.
        let schema = include_str!("../../../migrations/embedded/V0003__word_library.sql")
            .lines()
            .filter(|line| !line.trim_start().starts_with("--"))
            .collect::<Vec<_>>()
            .join("\n");
        for statement in schema.split(';').map(str::trim).filter(|s| !s.is_empty()) {
            let table = statement
                .split_whitespace()
                .nth(5)
                .ok_or_else(|| invalid("Invalid bundled library schema"))?;
            if !tables.contains(table) {
                self.native.execute(statement)?;
            }
        }
        self.import_library(&seed)
    }

    pub fn import_library(&self, seed: &LibrarySeed) -> Result<ImportReport, AppError> {
        // The adapter already holds the process-wide database file lock.
        self.native.transaction(|| {
            let existing_words: HashSet<String> = self
                .native
                .execute("SELECT spelling FROM ql_word")?
                .into_iter()
                .filter_map(|r| r.into_iter().next().flatten())
                .collect();
            let existing_books: HashSet<String> = self
                .native
                .execute("SELECT id FROM wordbook")?
                .into_iter()
                .filter_map(|r| r.into_iter().next().flatten())
                .collect();
            let new_words: Vec<_> = seed
                .words
                .iter()
                .filter(|w| !existing_words.contains(w["spelling"].as_str().unwrap()))
                .collect();
            for chunk in new_words.chunks(100) {
                let values = chunk
                    .iter()
                    .map(|w| word_values(w))
                    .collect::<Result<Vec<_>, _>>()?;
                self.native.execute(&format!(
                    "INSERT INTO ql_word ({}) VALUES {}",
                    COLUMNS.join(","),
                    values.join(",")
                ))?;
            }
            let mut inserted_books = 0;
            for book in &seed.books {
                if existing_books.contains(&book.id) {
                    continue;
                }
                self.native.execute(&format!(
                    "INSERT INTO wordbook (id,title,words) VALUES ({},{},{})",
                    literal(&book.id),
                    literal(&book.title),
                    array_literal(&book.words)
                ))?;
                inserted_books += 1;
                let stored = self.native.execute(&format!(
                    "SELECT array_to_string(words,CONVERT(X'1f' USING utf8mb4),CONVERT(X'00' USING utf8mb4)) FROM wordbook WHERE id={}",
                    literal(&book.id)
                ))?;
                let actual = decode_array(stored[0][0].as_deref())?;
                if actual != book.words {
                    return Err(invalid("Stored book order mismatch"));
                }
            }
            let all_words: HashSet<String> = self
                .native
                .execute("SELECT spelling FROM ql_word")?
                .into_iter()
                .filter_map(|r| r.into_iter().next().flatten())
                .collect();
            for row in self.native.execute("SELECT array_to_string(words,CONVERT(X'1f' USING utf8mb4),CONVERT(X'00' USING utf8mb4)) FROM wordbook")? {
                let members = decode_array(row[0].as_deref())?;
                if members.iter().any(|word| !all_words.contains(word)) {
                    return Err(invalid("Database contains a missing word reference"));
                }
            }
            Ok(ImportReport {
                inserted_words: new_words.len(),
                inserted_books,
                preserved_words: seed.words.len() - new_words.len(),
                preserved_books: seed.books.len() - inserted_books,
            })
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};
    #[test]
    #[ignore = "requires real seekdb and generated seed; run make test-db"]
    fn full_import_upgrade_preservation_and_rollback() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..");
        let seed = LibrarySeed::load(&root.join("build/content/word-library")).unwrap();
        assert_eq!(seed.books.len(), 11);
        let directory = root.join(format!(
            "build/test-databases/import-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_millis()
        ));
        let corrupt_seed = directory.with_extension("corrupt-seed");
        fs::create_dir_all(&corrupt_seed).unwrap();
        for entry in fs::read_dir(root.join("build/content/word-library")).unwrap() {
            let entry = entry.unwrap();
            fs::copy(entry.path(), corrupt_seed.join(entry.file_name())).unwrap();
        }
        fs::write(corrupt_seed.join("words.jsonl"), "tampered").unwrap();
        assert!(LibrarySeed::load(&corrupt_seed)
            .err()
            .unwrap()
            .message
            .contains("Checksum mismatch"));
        let runtime = root.join("deps/cache/seekdb-runtime");
        let db = SeekDbEmbeddedAdapter::open_with_runtime(&directory, &runtime).unwrap();
        db.ensure_card("preserved-review", 123).unwrap();
        // Model an existing V2 installation, then exercise the actual migration runner.
        db.native.execute("DROP TABLE ql_word").unwrap();
        db.native.execute("DROP TABLE wordbook").unwrap();
        db.native.execute("DROP TABLE ql_listening").unwrap();
        db.native
            .execute("DELETE FROM ql_schema_migration WHERE version>2")
            .unwrap();
        drop(db);
        let db = SeekDbEmbeddedAdapter::open_with_runtime(&directory, &runtime).unwrap();
        assert_eq!(db.ensure_card("preserved-review", 999).unwrap().version, 0);
        assert!(db
            .native
            .execute("SELECT material_id FROM ql_listening")
            .unwrap()
            .is_empty());
        let report = db
            .ensure_library(&root.join("build/content/word-library"))
            .unwrap();
        assert_eq!(report.inserted_words, seed.words.len());
        assert_eq!(report.inserted_books, 11);
        let key = seed.words[0]["spelling"].as_str().unwrap();
        let book = &seed.books[0].id;
        db.native
            .execute(&format!(
                "UPDATE ql_word SET meaning={},user_modified=TRUE,version=2 WHERE spelling={}",
                literal("用户修改的中文 ' \\ 内容"),
                literal(key)
            ))
            .unwrap();
        db.native
            .execute(&format!(
                "UPDATE wordbook SET title='Custom',words='[]' WHERE id={}",
                literal(book)
            ))
            .unwrap();
        drop(db);
        let db = SeekDbEmbeddedAdapter::open_with_runtime(&directory, &runtime).unwrap();
        let report = db
            .ensure_library(&root.join("build/content/word-library"))
            .unwrap();
        assert_eq!(report.inserted_words, 0);
        assert_eq!(report.inserted_books, 0);
        assert_eq!(
            db.native
                .execute(&format!(
                    "SELECT meaning,version FROM ql_word WHERE spelling={}",
                    literal(key)
                ))
                .unwrap()[0],
            vec![Some("用户修改的中文 ' \\ 内容".into()), Some("2".into())]
        );
        assert_eq!(
            db.native
                .execute(&format!(
                    "SELECT title,words FROM wordbook WHERE id={}",
                    literal(book)
                ))
                .unwrap()[0],
            vec![Some("Custom".into()), Some("[]".into())]
        );
        // Repair partial data even when row counts are nonzero.
        db.native
            .execute(&format!(
                "DELETE FROM ql_word WHERE spelling={}",
                literal(seed.words[1]["spelling"].as_str().unwrap())
            ))
            .unwrap();
        db.native
            .execute(&format!(
                "DELETE FROM wordbook WHERE id={}",
                literal(&seed.books[1].id)
            ))
            .unwrap();
        let report = db
            .ensure_library(&root.join("build/content/word-library"))
            .unwrap();
        assert_eq!(report.inserted_words, 1);
        assert_eq!(report.inserted_books, 1);
        // A missing table must be restored even with an up-to-date migration journal.
        db.native.execute("DROP TABLE wordbook").unwrap();
        let report = db
            .ensure_library(&root.join("build/content/word-library"))
            .unwrap();
        assert_eq!(report.inserted_words, 0);
        assert_eq!(report.inserted_books, 11);
        db.native.execute("DROP TABLE ql_word").unwrap();
        let report = db
            .ensure_library(&root.join("build/content/word-library"))
            .unwrap();
        assert_eq!(report.inserted_words, seed.words.len());
        assert_eq!(report.inserted_books, 0);
        // Force a failure after the word insert; the whole data import must roll back.
        db.native
            .execute(
                "ALTER TABLE wordbook ADD CONSTRAINT ck_reject_seed CHECK (id <> 'reject-import')",
            )
            .unwrap();
        let mut word = seed.words[0].clone();
        word["spelling"] = Value::String("zz-atomic-probe".into());
        let failing = LibrarySeed {
            words: vec![word],
            books: vec![Book {
                id: "reject-import".into(),
                title: "Rejected".into(),
                words: vec!["zz-atomic-probe".into()],
            }],
        };
        assert!(db.import_library(&failing).is_err());
        assert!(db
            .native
            .execute("SELECT spelling FROM ql_word WHERE spelling='zz-atomic-probe'")
            .unwrap()
            .is_empty());
        // Text resembling SQL is data, including in an ARRAY element.
        let spelling = "quote'\\中文; --";
        let mut word = seed.words[0].clone();
        word["spelling"] = Value::String(spelling.into());
        let special = LibrarySeed {
            words: vec![word],
            books: vec![Book {
                id: "special".into(),
                title: "中文'\\".into(),
                words: vec![spelling.into()],
            }],
        };
        assert_eq!(db.import_library(&special).unwrap().inserted_words, 1);
        assert_eq!(
            db.native
                .execute("SELECT COUNT(*) FROM ql_review_state")
                .unwrap()[0][0]
                .as_deref(),
            Some("1")
        );
    }
}

#[cfg(test)]
mod validation_tests {
    use super::*;
    use serde_json::json;
    fn word() -> Value {
        let mut row = serde_json::Map::new();
        for &column in COLUMNS {
            row.insert(column.into(), Value::Null);
        }
        for (column, value) in [
            ("spelling", "word"),
            ("language", "en"),
            ("meaning", "单词"),
            ("example", "A word."),
            ("example_translation", "一个词。"),
        ] {
            row.insert(column.into(), json!(value));
        }
        for column in ["example_generated", "user_modified"] {
            row.insert(column.into(), json!(false));
        }
        for column in ["version", "created_at", "updated_at"] {
            row.insert(column.into(), json!(1));
        }
        Value::Object(row)
    }
    #[test]
    fn validates_required_columns_and_types() {
        assert!(word_values(&word()).is_ok());
        assert!(word_values(&Value::Null).is_err());
        for &column in COLUMNS {
            let mut row = word();
            row.as_object_mut().unwrap().remove(column);
            assert!(word_values(&row).is_err(), "{column}");
        }
        for column in [
            "spelling",
            "language",
            "meaning",
            "example",
            "example_translation",
        ] {
            for invalid in [Value::Null, json!(" "), json!(5)] {
                let mut row = word();
                row[column] = invalid;
                assert!(word_values(&row).is_err(), "{column}");
            }
        }
        for column in [
            "version",
            "created_at",
            "updated_at",
            "example_generated",
            "user_modified",
        ] {
            let mut row = word();
            row[column] = json!("invalid");
            assert!(word_values(&row).is_err());
        }
        for (column, invalid) in [("version", 0), ("created_at", -1), ("updated_at", -1)] {
            let mut row = word();
            row[column] = json!(invalid);
            assert!(word_values(&row).is_err());
        }
    }
    #[test]
    fn validates_text_limits_in_characters_and_bytes() {
        for (column, length) in [
            ("language", 16),
            ("license_spdx", 64),
            ("source_revision", 128),
            ("phonetic_us", 256),
        ] {
            let mut row = word();
            row[column] = json!("中".repeat(length));
            assert!(word_values(&row).is_ok());
            row[column] = json!("中".repeat(length + 1));
            assert!(word_values(&row).is_err());
        }
        let mut row = word();
        row["meaning"] = json!("中".repeat(21845));
        assert!(word_values(&row).is_ok());
        row["meaning"] = json!("中".repeat(21846));
        assert!(word_values(&row).is_err());
    }
    #[test]
    fn validates_extra_examples_and_native_array_decoding() {
        let mut row = word();
        for value in [
            json!({}),
            json!([{}]),
            json!([{"textEn":"ok","textZh":" "}]),
        ] {
            row["extra_examples"] = value;
            assert!(word_values(&row).is_err());
        }
        row["extra_examples"] = json!([{"textEn":"A word.","textZh":"一个词。"}]);
        assert!(word_values(&row).is_ok());
        assert!(decode_array(None).is_err());
        assert!(decode_array(Some("bad\0key")).is_err());
        assert!(decode_array(Some("")).unwrap().is_empty());
        assert_eq!(
            decode_array(Some("US\u{1f}us\u{1f}中文'")).unwrap(),
            vec!["US", "us", "中文'"]
        );
        assert_eq!(
            array_literal(&["a'\\".into()]),
            literal(&json!(["a'\\"]).to_string())
        );
        for key in ["", " word", "word ", "a\nb", "a\u{1f}b"] {
            assert!(!valid_key(key, 256));
        }
        assert!(valid_key(&"中".repeat(256), 256));
        assert!(!valid_key(&"中".repeat(257), 256));
    }
    struct Fixture(std::path::PathBuf);
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    fn fixture(word: Value, book: Value) -> Fixture {
        static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let dir = std::env::temp_dir().join(format!(
            "quicklang-seed-unit-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        fs::create_dir_all(&dir).unwrap();
        let mut hashes = serde_json::Map::new();
        for (name, content) in [
            ("words.jsonl", word.to_string()),
            ("wordbooks.jsonl", book.to_string()),
            ("legacy-map.jsonl", String::new()),
            ("merge-conflicts.jsonl", String::new()),
            ("LICENSE", "fixture".into()),
            ("ATTRIBUTION.md", "fixture".into()),
            ("source-manifest.json", "{}".into()),
        ] {
            fs::write(dir.join(name), &content).unwrap();
            hashes.insert(
                name.into(),
                json!(format!("{:x}", Sha256::digest(content.as_bytes()))),
            );
        }
        fs::write(dir.join("manifest.json"),json!({"schema_version":3,"format":"quicklang-word-library-v1","files":hashes,"words":1,"wordbooks":1}).to_string()).unwrap();
        Fixture(dir)
    }
    #[test]
    fn verifies_seed_files_checksums_counts_and_membership_without_database() {
        let book = json!({"id":"book","title":"Book","words":["word"]});
        let valid = fixture(word(), book.clone());
        assert!(LibrarySeed::load(&valid.0).is_ok());
        fs::write(valid.0.join("words.jsonl"), "tampered").unwrap();
        assert!(LibrarySeed::load(&valid.0)
            .err()
            .unwrap()
            .message
            .contains("Checksum mismatch"));
        for members in [json!(["missing"]), json!(["word", "word"])] {
            let mut book = book.clone();
            book["words"] = members;
            let f = fixture(word(), book);
            assert!(LibrarySeed::load(&f.0).is_err());
        }
        for (key, value) in [
            ("schema_version", json!(99)),
            ("format", json!("bad")),
            ("words", json!(2)),
            ("files", json!({"../escape":"hash"})),
        ] {
            let f = fixture(word(), book.clone());
            let path = f.0.join("manifest.json");
            let mut manifest: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
            manifest[key] = value;
            fs::write(path, manifest.to_string()).unwrap();
            assert!(LibrarySeed::load(&f.0).is_err());
        }
    }
}
