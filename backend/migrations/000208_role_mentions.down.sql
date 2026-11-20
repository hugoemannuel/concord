ALTER TABLE server_notification_settings DROP COLUMN IF EXISTS suppress_roles;
ALTER TABLE messages DROP COLUMN IF EXISTS mention_roles;
ALTER TABLE roles DROP COLUMN IF EXISTS mentionable;
