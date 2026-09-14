-- Superseded JSON-book design, retained only for seekdb compatibility tests.
-- Two-table proposal. Not registered with the application migration runner.
-- spelling is the English word/phrase, NFKC-normalized and trimmed by the app.
-- Preserve case: US and us can be different entries. Timestamps are UTC milliseconds.
CREATE TABLE ql_word (
  spelling VARCHAR(256) COLLATE utf8mb4_bin PRIMARY KEY,
  language VARCHAR(16) NOT NULL DEFAULT 'en',
  meaning TEXT NOT NULL,
  phonetic_us VARCHAR(256),
  phonetic_uk VARCHAR(256),
  example TEXT,
  example_translation TEXT,
  example_source VARCHAR(256),
  example_license VARCHAR(64),
  example_generated BOOLEAN NOT NULL DEFAULT FALSE,
  extra_examples JSON,
  definition_source VARCHAR(256),
  source_url TEXT,
  source_revision VARCHAR(128),
  license_spdx VARCHAR(64),
  attribution LONGTEXT,
  original_spelling VARCHAR(256),
  original_meaning TEXT,
  user_modified BOOLEAN NOT NULL DEFAULT FALSE,
  version BIGINT NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  CONSTRAINT ck_word_extra_examples CHECK (extra_examples IS NULL OR JSON_TYPE(extra_examples) = 'ARRAY'),
  CONSTRAINT ck_word_example_pair CHECK (
    (example IS NULL AND example_translation IS NULL) OR
    (example IS NOT NULL AND example_translation IS NOT NULL)
  ),
  CONSTRAINT ck_word_version CHECK (version >= 1)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- words is an ordered JSON array of ql_word.spelling values.
-- JSON references are validated by the application, not foreign keys.
CREATE TABLE ql_wordbook (
  id VARCHAR(128) COLLATE utf8mb4_bin PRIMARY KEY,
  title VARCHAR(256) NOT NULL,
  words JSON NOT NULL,
  metadata JSON NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  CONSTRAINT ck_book_words CHECK (JSON_TYPE(words) = 'ARRAY'),
  CONSTRAINT ck_book_metadata CHECK (JSON_TYPE(metadata) = 'OBJECT'),
  CONSTRAINT ck_book_version CHECK (version >= 1)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
