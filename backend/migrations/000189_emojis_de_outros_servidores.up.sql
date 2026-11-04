-- Usar emojis e figurinhas de outros servidores (docs/adr/0052-emojis-de-outros-servidores.md).

-- Permissão nova (backend/internal/permission/perms.go): USE_EXTERNAL_EMOJIS
-- (1<<31 = 2147483648), ligada no @everyone de todo servidor.
UPDATE roles SET permissions = permissions | 2147483648 WHERE is_default;

-- Já foi usado fora do servidor: o arquivo passa a ser entregue a quem não é
-- membro (o id é um UUID aleatório, então não dá para listar os arquivos).
ALTER TABLE server_emojis ADD COLUMN published_at TIMESTAMPTZ NULL;
ALTER TABLE server_stickers ADD COLUMN published_at TIMESTAMPTZ NULL;

-- Apagados: a mensagem antiga e a reação ainda mostram o :nome:. A figurinha é
-- referenciada pela mensagem (ON DELETE SET NULL perde o id), então o nome vai
-- para a mensagem; o emoji é referenciado só pelo id, então fica numa lápide.
ALTER TABLE messages ADD COLUMN deleted_sticker_name TEXT NULL;

CREATE FUNCTION keep_deleted_sticker_name() RETURNS trigger AS $$
BEGIN
    UPDATE messages SET deleted_sticker_name = OLD.name WHERE sticker_id = OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER server_stickers_keep_name
BEFORE DELETE ON server_stickers
FOR EACH ROW EXECUTE FUNCTION keep_deleted_sticker_name();

CREATE TABLE deleted_emojis (
    id UUID PRIMARY KEY,
    name VARCHAR(32) NOT NULL,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE FUNCTION keep_deleted_emoji_name() RETURNS trigger AS $$
BEGIN
    INSERT INTO deleted_emojis (id, name) VALUES (OLD.id, OLD.name) ON CONFLICT (id) DO NOTHING;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER server_emojis_keep_name
BEFORE DELETE ON server_emojis
FOR EACH ROW EXECUTE FUNCTION keep_deleted_emoji_name();
