-- Quando o LiveKit começou (process_start_time_seconds do /metrics dele), em
-- cada minuto coletado (internal/liveobs, emenda no ADR 0029). Reinício do
-- LiveKit = o valor mudou de um minuto para o outro, sem depender da queda da
-- memória. NULL: o LiveKit não respondeu ou não exportou o valor.
ALTER TABLE livekit_metrics ADD COLUMN livekit_started_at TIMESTAMPTZ;
