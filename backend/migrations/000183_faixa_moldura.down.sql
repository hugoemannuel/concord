ALTER TABLE users
  DROP COLUMN IF EXISTS avatar_decoration_url,
  DROP COLUMN IF EXISTS nameplate_url,
  DROP COLUMN IF EXISTS nameplate_mode;
