-- Tipo do canal de sistema: o backend e os apps reconhecem o #musica do Maestro
-- e o #avisos pelo tipo, não pelo nome (ADR 0059). NULL nos canais comuns.
ALTER TABLE channels ADD COLUMN IF NOT EXISTS system_kind TEXT NULL
    CHECK (system_kind IN ('maestro', 'notices'));

-- Backfill pela mesma regra de nome que valia até aqui.
UPDATE channels SET system_kind = 'maestro'
WHERE is_system AND system_kind IS NULL AND name IN ('musica', 'musica-maestro');

UPDATE channels SET system_kind = 'notices'
WHERE is_system AND system_kind IS NULL AND name IN ('avisos', 'avisos-sistema');
