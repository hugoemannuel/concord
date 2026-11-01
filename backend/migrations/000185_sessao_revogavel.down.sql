-- O texto dos refresh tokens não volta (só o hash foi guardado): voltar esta
-- migration desloga todo mundo (cada um entra de novo com a senha).
DELETE FROM refresh_tokens;
DROP INDEX IF EXISTS refresh_tokens_expires_at_idx;
DROP INDEX IF EXISTS refresh_tokens_user_id_idx;
ALTER TABLE refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_token_hash_key;
ALTER TABLE refresh_tokens DROP COLUMN token_hash;
ALTER TABLE refresh_tokens ADD COLUMN token TEXT NOT NULL;
ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_token_key UNIQUE (token);
ALTER TABLE users DROP COLUMN token_version;
