DROP INDEX IF EXISTS idx_roles_one_system;
DELETE FROM roles WHERE is_system = TRUE;
UPDATE roles SET position = position - 1 WHERE NOT is_default AND position > 1;
ALTER TABLE roles DROP COLUMN IF EXISTS is_system;
