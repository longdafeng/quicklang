-- Reviewed contract only: NOT executed until the seekdb adapter is integrated.
-- MySQL-compatible baseline. No SQLite fallback.
CREATE TABLE schema_migration (
  version BIGINT PRIMARY KEY,
  checksum VARCHAR(64) NOT NULL,
  applied_at BIGINT NOT NULL
);
CREATE TABLE word_fact (
  id VARCHAR(26) PRIMARY KEY,
  language VARCHAR(16) NOT NULL,
  spelling VARCHAR(256) NOT NULL,
  normalized_spelling VARCHAR(256) NOT NULL,
  meaning TEXT NOT NULL,
  source_revision VARCHAR(64) NOT NULL
);
CREATE TABLE card (
  id VARCHAR(26) PRIMARY KEY,
  fact_id VARCHAR(26) NOT NULL,
  card_type VARCHAR(32) NOT NULL,
  template_version INT NOT NULL,
  suspended BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE review_state (
  card_id VARCHAR(26) PRIMARY KEY,
  phase VARCHAR(16) NOT NULL,
  due_at BIGINT NOT NULL,
  interval_days INT NOT NULL,
  ease DOUBLE NOT NULL,
  lapses INT NOT NULL,
  reps INT NOT NULL,
  version BIGINT NOT NULL
);
CREATE INDEX idx_review_due ON review_state(due_at);
CREATE TABLE review_event (
  id VARCHAR(26) PRIMARY KEY,
  card_id VARCHAR(26) NOT NULL,
  device_id VARCHAR(26) NOT NULL,
  reviewed_at BIGINT NOT NULL,
  rating VARCHAR(16) NOT NULL,
  metrics_json TEXT NOT NULL,
  algorithm_version VARCHAR(64) NOT NULL
);
CREATE INDEX idx_review_event_card_time ON review_event(card_id, reviewed_at);
