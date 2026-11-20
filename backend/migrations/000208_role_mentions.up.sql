-- Menção de cargo (ADR 0065): o cargo que qualquer pessoa pode mencionar, os
-- cargos que a mensagem pingou (id e o handle escrito no texto; NULL = nenhum)
-- e a preferência de ignorar menções de cargo, por servidor.
ALTER TABLE roles ADD COLUMN IF NOT EXISTS mentionable BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS mention_roles JSONB;
ALTER TABLE server_notification_settings ADD COLUMN IF NOT EXISTS suppress_roles BOOLEAN NOT NULL DEFAULT FALSE;
