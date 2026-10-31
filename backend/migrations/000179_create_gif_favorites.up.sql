-- GIFs favoritos, por usuário (docs/adr/0034-gifs-favoritos.md).
-- Guarda o que o seletor precisa para mostrar e enviar o GIF sem buscar de
-- novo no GIPHY. O limite por pessoa (200) é aplicado no backend.
CREATE TABLE gif_favorites (
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    gif_id VARCHAR(128) NOT NULL,
    title VARCHAR(200) NOT NULL DEFAULT '',
    url VARCHAR(500) NOT NULL,
    preview_url VARCHAR(500) NOT NULL DEFAULT '',
    width INTEGER NOT NULL DEFAULT 0,
    height INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, gif_id)
);

-- Listagem do mais novo para o mais antigo.
CREATE INDEX idx_gif_favorites_user_created ON gif_favorites (user_id, created_at DESC);
