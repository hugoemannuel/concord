DROP TABLE IF EXISTS attachment_views;
DROP TABLE IF EXISTS view_once_recipients;
ALTER TABLE message_attachments DROP COLUMN IF EXISTS view_once_gone_at;
ALTER TABLE message_attachments DROP COLUMN IF EXISTS view_once;
DROP INDEX IF EXISTS messages_expires_at_idx;
ALTER TABLE messages DROP COLUMN IF EXISTS expires_at;
ALTER TABLE conversations DROP COLUMN IF EXISTS disappearing_seconds;
