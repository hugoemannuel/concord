-- Relatório de erros do app (internal/apperrors, ADR 0068): o desktop, o web,
-- o Android e os panics do backend mandam erros já limpos (sem token, e-mail,
-- id nem caminho de usuário). Um grupo por impressão digital (calculada no
-- servidor) e uma linha de ocorrência por (grupo, pessoa, hora, versão), com a
-- contagem somada. Retenção de 14 dias (o backend apaga de hora em hora:
-- ocorrência pela hora, grupo pela última vez). Apagar a conta apaga as
-- ocorrências dela.
CREATE TABLE IF NOT EXISTS app_error_groups (
    fingerprint TEXT PRIMARY KEY,
    -- renderer | main | mobile | backend
    source TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    -- a primeira pilha vista (limpa); a tradução pelos source maps é na leitura.
    stack TEXT NOT NULL DEFAULT '',
    first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    first_version TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS app_error_groups_first_seen_idx ON app_error_groups (first_seen);
CREATE INDEX IF NOT EXISTS app_error_groups_last_seen_idx ON app_error_groups (last_seen);

CREATE TABLE IF NOT EXISTS app_error_occurrences (
    id BIGSERIAL PRIMARY KEY,
    fingerprint TEXT NOT NULL REFERENCES app_error_groups (fingerprint) ON DELETE CASCADE,
    -- NULL: sem conta (panic do backend fora de rota com login).
    user_id UUID REFERENCES users (id) ON DELETE CASCADE,
    -- a hora cheia (date_trunc) em que aconteceu.
    hour TIMESTAMPTZ NOT NULL,
    last_at TIMESTAMPTZ NOT NULL,
    app_version TEXT NOT NULL DEFAULT '',
    os TEXT NOT NULL DEFAULT '',
    -- desktop | web | android | servidor
    target TEXT NOT NULL DEFAULT '',
    -- padrão da rota/tela (/servers/:id), nunca a URL com ids.
    screen TEXT NOT NULL DEFAULT '',
    in_call BOOLEAN NOT NULL DEFAULT FALSE,
    in_live BOOLEAN NOT NULL DEFAULT FALSE,
    count INT NOT NULL DEFAULT 1,
    CONSTRAINT app_error_occurrences_key UNIQUE NULLS NOT DISTINCT (fingerprint, user_id, hour, app_version)
);
CREATE INDEX IF NOT EXISTS app_error_occurrences_hour_idx ON app_error_occurrences (hour);
CREATE INDEX IF NOT EXISTS app_error_occurrences_group_hour_idx ON app_error_occurrences (fingerprint, hour);
