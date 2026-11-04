-- "Canais de texto" e "Canais de voz" viram categorias reais, e categoria pode ser
-- privada (docs/adr/0055-categorias-normais-e-privadas.md).

CREATE TABLE category_overwrites (
    category_id UUID NOT NULL REFERENCES channel_categories(id) ON DELETE CASCADE,
    target_type VARCHAR(10) NOT NULL CHECK (target_type IN ('role', 'member')),
    target_id UUID NOT NULL,
    allow BIGINT NOT NULL DEFAULT 0,
    deny BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (category_id, target_type, target_id)
);

CREATE INDEX category_overwrites_target ON category_overwrites(target_type, target_id);

-- Só para o down saber quais categorias esta migration criou.
ALTER TABLE channel_categories ADD COLUMN created_by_migration BOOLEAN NOT NULL DEFAULT FALSE;

-- Os canais soltos de hoje, na ordem em que aparecem na barra: com categorias no
-- servidor, a posição da organização manda; sem nenhuma, o app ignora a organização
-- e usa a posição do canal. Canal de sistema e de evento entram como qualquer outro.
CREATE TEMP TABLE m194_soltos AS
SELECT c.id AS channel_id, c.server_id, c.type,
       ROW_NUMBER() OVER (
           PARTITION BY c.server_id, c.type
           ORDER BY CASE WHEN EXISTS (SELECT 1 FROM channel_categories g WHERE g.server_id = c.server_id)
                         THEN COALESCE(l.position, c.position) ELSE 0 END,
                    c.position, c.created_at, c.name
       ) AS ordem
FROM channels c
LEFT JOIN channel_category_layout l ON l.channel_id = c.id
WHERE l.category_id IS NULL AND c.type IN ('text', 'voice');

-- Cada uma só existe se tiver canal daquele tipo solto ou se o servidor não tiver
-- categoria nenhuma.
CREATE TEMP TABLE m194_padroes AS
SELECT s.id AS server_id, k.type, k.name, k.frente
FROM servers s
CROSS JOIN (VALUES ('text', 'Canais de texto', 0), ('voice', 'Canais de voz', 1)) AS k(type, name, frente)
WHERE EXISTS (SELECT 1 FROM m194_soltos m WHERE m.server_id = s.id AND m.type = k.type)
   OR NOT EXISTS (SELECT 1 FROM channel_categories g WHERE g.server_id = s.id);

-- Já existe categoria com esse nome (sem diferenciar maiúsculas): é ela que recebe os
-- canais, para não ficarem duas iguais.
INSERT INTO channel_categories (server_id, name, position, created_by_migration)
SELECT p.server_id, p.name, 0, TRUE
FROM m194_padroes p
WHERE NOT EXISTS (
    SELECT 1 FROM channel_categories g
    WHERE g.server_id = p.server_id AND lower(btrim(g.name)) = lower(p.name)
);

CREATE TEMP TABLE m194_destinos AS
SELECT DISTINCT ON (p.server_id, p.type) p.server_id, p.type, p.frente, g.id AS category_id
FROM m194_padroes p
JOIN channel_categories g ON g.server_id = p.server_id AND lower(btrim(g.name)) = lower(p.name)
ORDER BY p.server_id, p.type, g.position, g.id;

-- Categoria reaproveitada: o que já estava nela fica depois dos canais que chegam.
UPDATE channel_category_layout l
SET position = l.position + n.total
FROM m194_destinos d
JOIN (SELECT server_id, type, COUNT(*) AS total FROM m194_soltos GROUP BY server_id, type) n
  ON n.server_id = d.server_id AND n.type = d.type
WHERE l.category_id = d.category_id;

INSERT INTO channel_category_layout (channel_id, server_id, category_id, position)
SELECT m.channel_id, m.server_id, d.category_id, m.ordem - 1
FROM m194_soltos m
JOIN m194_destinos d ON d.server_id = m.server_id AND d.type = m.type
ON CONFLICT (channel_id) DO UPDATE SET category_id = EXCLUDED.category_id, position = EXCLUDED.position;

-- As duas ficam no topo, onde as seções estavam; as outras seguem na ordem que tinham.
UPDATE channel_categories g
SET position = o.n - 1
FROM (
    SELECT c.id, ROW_NUMBER() OVER (
        PARTITION BY c.server_id ORDER BY d.frente NULLS LAST, c.position, c.id
    ) AS n
    FROM channel_categories c
    LEFT JOIN m194_destinos d ON d.category_id = c.id
    WHERE c.server_id IN (SELECT server_id FROM m194_destinos)
) o
WHERE g.id = o.id;

DROP TABLE m194_destinos;
DROP TABLE m194_padroes;
DROP TABLE m194_soltos;
