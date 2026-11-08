-- Cache da prévia de links do chat (internal/linkpreview), por URL
-- normalizada. failed guarda também a falha (24 h) para não martelar site fora
-- do ar; image_id é o arquivo da imagem em UPLOADS_DIR/link-previews.
CREATE TABLE IF NOT EXISTS link_previews (
    url TEXT PRIMARY KEY,
    site_name TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    image_id UUID NULL,
    color TEXT NOT NULL DEFAULT '',
    youtube_id TEXT NOT NULL DEFAULT '',
    failed BOOLEAN NOT NULL DEFAULT false,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS link_previews_fetched_at_idx ON link_previews (fetched_at);
