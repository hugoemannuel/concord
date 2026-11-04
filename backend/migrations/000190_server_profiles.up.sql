-- Customização do servidor (#528, ADR 0050): o perfil, a faixa, o fundo e a tag.
CREATE TABLE IF NOT EXISTS server_profiles (
    server_id UUID PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
    banner_preset TEXT NOT NULL DEFAULT '',
    banner_image TEXT NOT NULL DEFAULT '',
    traits JSONB NOT NULL DEFAULT '[]'::jsonb,
    description TEXT NOT NULL DEFAULT '',
    games JSONB NOT NULL DEFAULT '[]'::jsonb,
    private BOOLEAN NOT NULL DEFAULT FALSE,
    strip_preset TEXT NOT NULL DEFAULT '',
    strip_image TEXT NOT NULL DEFAULT '',
    theme_starter TEXT NOT NULL DEFAULT '',
    theme_image TEXT NOT NULL DEFAULT '',
    theme_dim INTEGER NOT NULL DEFAULT 50,
    tag_name TEXT NOT NULL DEFAULT '',
    tag_badge TEXT NOT NULL DEFAULT '',
    tag_color TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A tag que cada pessoa usa (uma por vez). A chave para server_members tira a
-- tag sozinha quando a pessoa sai, é expulsa ou banida (e o servidor apagado).
CREATE TABLE IF NOT EXISTS user_server_tags (
    user_id UUID PRIMARY KEY,
    server_id UUID NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (server_id, user_id) REFERENCES server_members (server_id, user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS user_server_tags_server_idx ON user_server_tags (server_id);

-- "Seus membros jogam": só o total de amostras por jogo no servidor, sem dizer
-- quem jogou.
CREATE TABLE IF NOT EXISTS server_game_samples (
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    game TEXT NOT NULL,
    app_id BIGINT NOT NULL DEFAULT 0,
    icon_hash TEXT NOT NULL DEFAULT '',
    samples BIGINT NOT NULL DEFAULT 0,
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (server_id, game)
);
