-- Resumo diário dos alertas (internal/alert, emenda da ADR 0071): uma linha
-- por dia resumido (horário de Brasília), gravada antes de postar, para um
-- reinício (ou dois processos no deploy) não mandar o mesmo resumo duas vezes.
-- Retenção de 14 dias (o backend apaga).
CREATE TABLE alert_daily_summaries (
    day DATE PRIMARY KEY,
    sent_at TIMESTAMPTZ NOT NULL
);
