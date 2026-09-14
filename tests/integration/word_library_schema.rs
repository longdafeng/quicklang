//! Verify the legacy JSON schema and probe ARRAY compatibility in pinned seekdb.
#[path = "../../src/crates/storage-seekdb/src/native.rs"]
mod native;
use std::{
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

#[test]
#[ignore = "requires bundled macOS ARM64 seekdb runtime"]
fn shared_words_and_ordered_json_books() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let runtime = std::env::var_os("QUICKLANG_TEST_RUNTIME")
        .map(PathBuf::from)
        .unwrap_or_else(|| root.join("deps/cache/seekdb-runtime"));
    let data = root.join(format!(
        "build/test-databases/library-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis()
    ));
    std::fs::create_dir_all(&data).unwrap();
    let db = native::Native::open(&data.canonicalize().unwrap(), &runtime).unwrap();
    let array_ddl = include_str!("../../src/migrations/proposed/V0003__word_library.sql");
    let array_sql = array_ddl
        .lines()
        .filter(|line| !line.trim_start().starts_with("--"))
        .collect::<Vec<_>>()
        .join("\n");
    for statement in array_sql
        .split(';')
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        db.execute(statement).unwrap();
    }
    let definition = db.execute("SHOW CREATE TABLE wordbook").unwrap();
    assert!(definition[0][1]
        .as_deref()
        .unwrap()
        .contains("ARRAY(VARCHAR(256))"));
    db.execute(r#"INSERT INTO wordbook (id,title,words) VALUES ('array-book','测试','["US","us","apple"]'),('empty','空词书','[]')"#).unwrap();
    assert_eq!(
        db.execute("SELECT words FROM wordbook WHERE id='array-book'")
            .unwrap(),
        vec![vec![Some(r#"["US","us","apple"]"#.into())]]
    );
    assert_eq!(
        db.execute("SELECT words FROM wordbook WHERE id='empty'")
            .unwrap(),
        vec![vec![Some("[]".into())]]
    );
    db.execute(r#"UPDATE wordbook SET words='["US","banana","us","apple"]' WHERE id='array-book'"#)
        .unwrap();
    assert_eq!(
        db.execute("SELECT words FROM wordbook WHERE id='array-book'")
            .unwrap(),
        vec![vec![Some(r#"["US","banana","us","apple"]"#.into())]]
    );
    assert!(db
        .execute("INSERT INTO wordbook (id,title,words) VALUES ('null','空',NULL)")
        .is_err());
    db.execute("DROP TABLE wordbook").unwrap();
    db.execute("DROP TABLE ql_word").unwrap();
    let ddl = include_str!("../../src/migrations/proposed/word_library_seekdb_legacy.sql");
    let sql = ddl
        .lines()
        .filter(|line| !line.trim_start().starts_with("--"))
        .collect::<Vec<_>>()
        .join("\n");
    for statement in sql.split(';').map(str::trim).filter(|s| !s.is_empty()) {
        db.execute(statement).unwrap();
    }
    db.execute("INSERT INTO ql_word (spelling,meaning,phonetic_us,example,example_translation,example_source,example_generated,created_at,updated_at) VALUES ('abruptly','adv. 突然地','/test/','The road ends abruptly.','道路突然到头了。','quicklang-ai-authored',TRUE,0,0),('practice','练习',NULL,NULL,NULL,NULL,FALSE,0,0)").unwrap();
    db.execute(r#"UPDATE ql_word SET extra_examples='[{"textEn":"The ground rises abruptly.","textZh":"地势突然隆起。","source":"kylebing"}]' WHERE spelling='abruptly'"#).unwrap();
    db.execute(r#"INSERT INTO ql_wordbook VALUES ('a','四级','["practice","abruptly"]','{}',1,0,0),('b','六级','["abruptly"]','{}',1,0,0)"#).unwrap();
    assert_eq!(db.execute("SHOW TABLES").unwrap().len(), 2);
    // Spelling identity is case-sensitive for inserts, lookups, updates and deletes.
    db.execute("INSERT INTO ql_word (spelling,meaning,created_at,updated_at) VALUES ('US','美国',0,0),('us','我们',0,0)").unwrap();
    for (spelling, meaning) in [("US", "美国"), ("us", "我们")] {
        let rows = db
            .execute(&format!(
                "SELECT meaning FROM ql_word WHERE spelling='{spelling}'"
            ))
            .unwrap();
        assert_eq!(rows, vec![vec![Some(meaning.into())]]);
    }
    assert!(db
        .execute("SELECT spelling FROM ql_word WHERE spelling='Us'")
        .unwrap()
        .is_empty());
    assert!(db
        .execute(
            "INSERT INTO ql_word (spelling,meaning,created_at,updated_at) VALUES ('US','重复',0,0)"
        )
        .is_err());
    db.execute("UPDATE ql_word SET meaning='美国（缩写）' WHERE spelling='US'")
        .unwrap();
    assert_eq!(
        db.execute("SELECT meaning FROM ql_word WHERE spelling='us'")
            .unwrap(),
        vec![vec![Some("我们".into())]]
    );
    db.execute("DELETE FROM ql_word WHERE spelling='US'")
        .unwrap();
    assert_eq!(
        db.execute("SELECT spelling FROM ql_word WHERE spelling IN ('US','us')")
            .unwrap(),
        vec![vec![Some("us".into())]]
    );
    assert_eq!(
        db.execute("SELECT JSON_UNQUOTE(JSON_EXTRACT(words,'$[0]')) FROM ql_wordbook WHERE id='a'")
            .unwrap()[0][0]
            .as_deref(),
        Some("practice")
    );
    assert_eq!(
        db.execute("SELECT example_translation FROM ql_word WHERE spelling='abruptly'")
            .unwrap()[0][0]
            .as_deref(),
        Some("道路突然到头了。")
    );
    assert!(db
        .execute("INSERT INTO ql_word (spelling,meaning,created_at,updated_at) VALUES ('abruptly','重复',0,0)")
        .is_err());
    assert!(db
        .execute("INSERT INTO ql_word (spelling,meaning,extra_examples,created_at,updated_at) VALUES ('invalid','无效','{}',0,0)")
        .is_err());
    assert!(db
        .execute("INSERT INTO ql_wordbook VALUES ('invalid','无效','{}','{}',1,0,0)")
        .is_err());
    assert!(db
        .execute("INSERT INTO ql_wordbook VALUES ('invalid','无效','not-json','{}',1,0,0)")
        .is_err());
    db.execute(
        "UPDATE ql_word SET meaning='突然地；猛然',version=version+1 WHERE spelling='abruptly'",
    )
    .unwrap();
    let rows = db.execute(r#"SELECT w.meaning FROM ql_wordbook b JOIN ql_word w ON JSON_CONTAINS(b.words,JSON_QUOTE(w.spelling)) WHERE w.spelling='abruptly'"#).unwrap();
    assert_eq!(rows.len(), 2);
    assert!(rows.iter().all(|r| r[0].as_deref() == Some("突然地；猛然")));
    assert!(db.execute("INSERT INTO ql_word (spelling,meaning,example,created_at,updated_at) VALUES ('bad-pair','无效','Only English.',0,0)").is_err());
    assert_eq!(db.execute("SELECT JSON_UNQUOTE(JSON_EXTRACT(extra_examples,'$[0].textZh')) FROM ql_word WHERE spelling='abruptly'").unwrap()[0][0].as_deref(),Some("地势突然隆起。"));
    assert_eq!(
        db.execute("SELECT example_generated,phonetic_us FROM ql_word WHERE spelling='abruptly'")
            .unwrap()[0],
        vec![Some("1".into()), Some("/test/".into())]
    );
    let failed = db.transaction(|| {
        db.execute("UPDATE ql_wordbook SET words='[]' WHERE id='a'")?;
        db.execute("INSERT INTO ql_word (spelling,meaning,created_at,updated_at) VALUES ('abruptly','重复',0,0)")?;
        Ok(())
    });
    assert!(failed.is_err());
    assert_eq!(
        db.execute("SELECT JSON_LENGTH(words) FROM ql_wordbook WHERE id='a'")
            .unwrap()[0][0]
            .as_deref(),
        Some("2")
    );
    db.execute("DELETE FROM ql_wordbook WHERE id='a'").unwrap();
    assert_eq!(
        db.execute("SELECT spelling FROM ql_word WHERE spelling='abruptly'")
            .unwrap()
            .len(),
        1
    );
    // JSON strings do not have FK protection. This must be rejected by the future service layer.
    db.execute(r#"INSERT INTO ql_wordbook VALUES ('unchecked','未校验','["missing"]','{}',1,0,0)"#)
        .unwrap();
    eprintln!("Verified two-table schema in {}", data.display());
}
