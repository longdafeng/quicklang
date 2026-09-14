# Migration contract

The embedded runner in `storage-seekdb` registers V0002 (review state/events) and
V0003 (word library). It validates the complete applied checksum prefix, holds an
exclusive database file lock, and applies missing versions with restart-safe DDL.
MySQL DDL auto-commits; migration records are written only after each version succeeds.
Unknown versions or modified checksums fail without silently accepting schema drift.

`embedded/V0003__word_library.sql` creates two content tables: `ql_word` with a
case-sensitive spelling primary key and `wordbook` with native VARCHAR(256)[] words.
Array defaults are unsupported: an empty book must explicitly supply an empty array.
Existing review and migration tables are infrastructure, not extra content tables.

`make init` generates a validated seed from bundled Ink assets and imports it using
`init-word-library`. Data writes run in one transaction, insert only missing keys,
verify book order and references, and preserve existing words, books and reviews.
A failed import can be retried; successfully created empty tables may remain after
failure because DDL and the data transaction are separate.

`proposed/V0003__word_library.sql` is the readable schema design. The legacy JSON
proposal is retained only for regression tests; do not execute proposed files as migrations.
The older V0001 framework design is not registered with the embedded runner.
See `docs/development/word-library-schema.md` for data generation and initialization details.

`embedded/V0004__listening.sql` 增加按本机用户隔离的听力材料表；音频与 JSON 训练状态共同提交，版本号用于并发写入检查。旧迁移不改动，启动时由现有 seekdb 迁移日志应用新表。
