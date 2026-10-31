-- Jogo opcional do evento (docs/superpowers/specs/2026-10-30-eventos-jogo-associado-design.md):
-- só o nome, do catálogo da atividade ou digitado. Nulo = sem jogo.
ALTER TABLE server_events ADD COLUMN game_name VARCHAR(64);
