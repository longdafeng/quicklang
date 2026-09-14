-- Listening content and progress are isolated by local profile.
CREATE TABLE IF NOT EXISTS ql_listening (
    owner_id VARCHAR(128) NOT NULL,
    material_id VARCHAR(128) NOT NULL,
    version BIGINT UNSIGNED NOT NULL,
    payload JSON NOT NULL,
    audio MEDIUMBLOB NOT NULL,
    PRIMARY KEY (owner_id, material_id)
);
