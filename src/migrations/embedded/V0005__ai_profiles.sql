-- One device-local snapshot makes profile CRUD and active selection atomic.
-- API keys appear only as versioned AES-256-GCM envelopes inside this payload.
CREATE TABLE IF NOT EXISTS ql_ai_profiles (
    singleton_id BIGINT PRIMARY KEY,
    payload JSON NOT NULL
);
INSERT IGNORE INTO ql_ai_profiles (singleton_id, payload)
VALUES (1, '{"profiles":[],"active_id":null,"master_key_initialized":false}');
