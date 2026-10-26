DROP INDEX IF EXISTS idx_channels_system_name_per_server;
UPDATE channels SET is_system = FALSE WHERE is_system = TRUE AND name = 'avisos';
CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_one_system_per_server ON channels (server_id) WHERE is_system;
