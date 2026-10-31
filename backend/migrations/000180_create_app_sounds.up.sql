-- Sons do app por pessoa (docs/adr/0035-sons-do-app-personalizados.md): o
-- pacote escolhido, o volume e a escolha por evento ("events": evento → pacote,
-- "custom" ou "off"). Sem linha = padrão (pacote salinha, 100%).
CREATE TABLE user_app_sound_settings (
    user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    pack VARCHAR(32) NOT NULL DEFAULT 'salinha',
    volume SMALLINT NOT NULL DEFAULT 100 CHECK (volume BETWEEN 0 AND 200),
    events JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Áudio próprio por evento: o arquivo fica em uploads/profile/app-sounds/<file_id>,
-- id novo a cada envio (a troca apaga o anterior).
CREATE TABLE user_app_sound_files (
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    event VARCHAR(32) NOT NULL,
    file_id UUID NOT NULL,
    duration_ms INTEGER NOT NULL CHECK (duration_ms BETWEEN 100 AND 5000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, event)
);
