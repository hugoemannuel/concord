-- Canal de sistema "avisos": mostra cada usuário novo que entra no servidor.
-- Como o canal "bot", não pode ser editado nem removido, só movido.
DROP INDEX IF EXISTS idx_channels_one_system_per_server;

-- Se um servidor já tem um canal de voz com nome exato "avisos", muda para
-- "Avisos" para liberar o nome "avisos" no UNIQUE (server_id, name).
UPDATE channels c
SET name = 'Avisos'
WHERE c.name = 'avisos' AND c.type = 'voice'
  AND NOT EXISTS (
      SELECT 1 FROM channels c2
      WHERE c2.server_id = c.server_id AND c2.name = 'Avisos'
  );

-- Servidor que já tem um canal de texto "avisos" adota o mais antigo como de sistema.
UPDATE channels c
SET is_system = TRUE, name = 'avisos'
WHERE c.id IN (
    SELECT DISTINCT ON (server_id) id
    FROM channels
    WHERE LOWER(name) = 'avisos' AND type = 'text' AND is_system = FALSE
    ORDER BY server_id, created_at ASC, id ASC
)
AND NOT EXISTS (
    SELECT 1 FROM channels s
    WHERE s.server_id = c.server_id AND s.name = 'avisos' AND s.id <> c.id
);

-- channels.id não tem DEFAULT: o id tem que ser gerado aqui com gen_random_uuid().
INSERT INTO channels (id, server_id, name, type, position, created_by, is_system)
SELECT
    gen_random_uuid(),
    s.id,
    CASE WHEN EXISTS (SELECT 1 FROM channels c WHERE c.server_id = s.id AND c.name = 'avisos')
        THEN 'avisos-sistema' ELSE 'avisos' END,
    'text',
    (SELECT COALESCE(MAX(c.position) + 1, 0) FROM channels c WHERE c.server_id = s.id AND c.type = 'text'),
    s.owner_id,
    TRUE
FROM servers s
WHERE NOT EXISTS (
    SELECT 1 FROM channels c WHERE c.server_id = s.id AND c.is_system AND c.name IN ('avisos', 'avisos-sistema')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_system_name_per_server ON channels (server_id, name) WHERE is_system;
