-- Sem a categoria para esconder o canal, quem ela negava continua negado no próprio
-- canal (VIEW_CHANNEL = 1). Pode tirar acesso de quem via; nunca dá acesso a mais.
INSERT INTO channel_overwrites (channel_id, target_type, target_id, allow, deny)
SELECT l.channel_id, o.target_type, o.target_id, 0, 1
FROM category_overwrites o
JOIN channel_category_layout l ON l.category_id = o.category_id
WHERE o.deny & 1 <> 0
ON CONFLICT (channel_id, target_type, target_id)
DO UPDATE SET deny = channel_overwrites.deny | 1, allow = channel_overwrites.allow & ~1::BIGINT;

-- O que a migration criou volta a ser canal solto (a chave estrangeira limpa a categoria).
DELETE FROM channel_categories WHERE created_by_migration;

ALTER TABLE channel_categories DROP COLUMN created_by_migration;
DROP TABLE category_overwrites;
