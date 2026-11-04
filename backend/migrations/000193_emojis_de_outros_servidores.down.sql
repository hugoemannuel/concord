DROP TRIGGER IF EXISTS server_emojis_keep_name ON server_emojis;
DROP FUNCTION IF EXISTS keep_deleted_emoji_name();
DROP TABLE IF EXISTS deleted_emojis;

DROP TRIGGER IF EXISTS server_stickers_keep_name ON server_stickers;
DROP FUNCTION IF EXISTS keep_deleted_sticker_name();
ALTER TABLE messages DROP COLUMN IF EXISTS deleted_sticker_name;

ALTER TABLE server_stickers DROP COLUMN IF EXISTS published_at;
ALTER TABLE server_emojis DROP COLUMN IF EXISTS published_at;

UPDATE roles SET permissions = permissions & ~2147483648;
UPDATE channel_overwrites SET allow = allow & ~2147483648, deny = deny & ~2147483648;
