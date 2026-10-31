-- Revogação real de sessão (docs/adr/0039-revogacao-de-sessao.md).
--
-- users.token_version vai no token de acesso (claim "ver") e é conferida no
-- middleware e no WebSocket: sair de todos os dispositivos, redefinir a senha
-- e excluir a conta incrementam e derrubam os tokens já emitidos. Começa em 0,
-- o mesmo valor que os tokens antigos (sem "ver") representam: ninguém sai.
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;

-- Refresh token guardado só como sha256 (hex). Os existentes são convertidos
-- aqui mesmo, então quem está logado continua logado; os vencidos saem.
ALTER TABLE refresh_tokens ADD COLUMN token_hash TEXT;
UPDATE refresh_tokens SET token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex');
DELETE FROM refresh_tokens WHERE expires_at < NOW();
ALTER TABLE refresh_tokens ALTER COLUMN token_hash SET NOT NULL;
ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash);
ALTER TABLE refresh_tokens DROP COLUMN token;
CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_expires_at_idx ON refresh_tokens (expires_at);
