-- Telemetria do app Android (ADR 0070): fabricante e modelo do celular, para
-- saber se um problema se concentra num aparelho. Vazio no desktop e na web.
ALTER TABLE live_sessions ADD COLUMN device TEXT NOT NULL DEFAULT '';
