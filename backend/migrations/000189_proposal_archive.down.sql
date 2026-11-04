DROP INDEX IF EXISTS proposals_archived_idx;
ALTER TABLE proposals DROP COLUMN IF EXISTS archived_at;
