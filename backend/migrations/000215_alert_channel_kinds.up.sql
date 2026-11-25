-- Canais de sistema dos alertas (internal/alert, ADR 0071): o backend garante
-- estes canais no servidor de ALERTS_SERVER_ID e os reconhece pelo tipo.
-- alert_infra = #alertas, alert_errors = #erros, alert_quality = #qualidade,
-- alert_daily = #resumo-diario.
ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_system_kind_check;
ALTER TABLE channels ADD CONSTRAINT channels_system_kind_check
    CHECK (system_kind IN ('maestro', 'notices', 'alert_infra', 'alert_errors', 'alert_quality', 'alert_daily'));
