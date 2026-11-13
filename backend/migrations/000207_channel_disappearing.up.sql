-- Mensagens temporárias por canal (NULL = desativado) e se o canal aceita visualização única.
ALTER TABLE channels ADD COLUMN IF NOT EXISTS disappearing_seconds INTEGER
    CHECK (disappearing_seconds IN (86400, 604800, 7776000));
ALTER TABLE channels ADD COLUMN IF NOT EXISTS allow_view_once BOOLEAN NOT NULL DEFAULT true;
