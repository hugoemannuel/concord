-- Cargo de sistema "Bots": atribuído automaticamente ao Maestro (e futuros bots).
-- Fica na posição 1 (abaixo de todos os cargos normais e acima apenas de @everyone),
-- com hoist = TRUE para aparecer na lista de membros logo acima de "Membros" e "Offline".
ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;

-- Abre a posição 1 em todos os servidores subindo os cargos existentes (exceto @everyone).
UPDATE roles
SET position = position + 1
WHERE NOT is_default AND NOT is_system;

-- Cria o cargo "Bots" (posição 1, hoist = TRUE, is_system = TRUE) em cada servidor.
INSERT INTO roles (server_id, name, position, permissions, hoist, is_default, is_system)
SELECT
    s.id,
    'Bots',
    1,
    0,
    TRUE,
    FALSE,
    TRUE
FROM servers s
WHERE NOT EXISTS (
    SELECT 1 FROM roles r WHERE r.server_id = s.id AND r.is_system = TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_one_system ON roles (server_id) WHERE is_system;

-- Atribui o cargo "Bots" ao Maestro em todos os servidores onde ele está presente.
INSERT INTO member_roles (server_id, user_id, role_id)
SELECT sm.server_id, sm.user_id, r.id
FROM server_members sm
JOIN users u ON u.id = sm.user_id AND u.is_bot = TRUE
JOIN roles r ON r.server_id = sm.server_id AND r.is_system = TRUE
ON CONFLICT DO NOTHING;
