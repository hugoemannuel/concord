-- Alertas (internal/alert, ADR 0071). Retenção de 14 dias (o backend apaga).
--
-- alert_incidents: cada vez que uma regra disparou, de quando a quando. O
-- incidente aberto (ended_at NULL, no máximo um por regra) é o estado da regra:
-- reiniciar o backend não repete o aviso. Eventos pontuais (unidade do systemd
-- que falhou) nascem com ended_at = started_at.
CREATE TABLE alert_incidents (
    id BIGSERIAL PRIMARY KEY,
    rule_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('aviso', 'critico')),
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    -- Última mensagem postada (disparo, agravou ou lembrete).
    last_message_at TIMESTAMPTZ,
    text TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX alert_incidents_open_idx ON alert_incidents (rule_id) WHERE ended_at IS NULL;
CREATE INDEX alert_incidents_started_idx ON alert_incidents (started_at DESC);

-- backend_runs: cada vez que o backend subiu com os alertas ligados. stopped_at
-- é gravado no SIGTERM (parada limpa: deploy, systemctl stop); NULL num boot
-- anterior = o processo caiu ou a VPS parou de repente.
CREATE TABLE backend_runs (
    id BIGSERIAL PRIMARY KEY,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version TEXT NOT NULL DEFAULT '',
    stopped_at TIMESTAMPTZ
);
CREATE INDEX backend_runs_started_idx ON backend_runs (started_at DESC);
