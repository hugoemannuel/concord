-- Os canais de alerta voltam a ser canais comuns (podem ser apagados pelo app).
UPDATE channels SET system_kind = NULL, is_system = FALSE
WHERE system_kind IN ('alert_infra', 'alert_errors', 'alert_quality', 'alert_daily');
ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_system_kind_check;
ALTER TABLE channels ADD CONSTRAINT channels_system_kind_check
    CHECK (system_kind IN ('maestro', 'notices'));
