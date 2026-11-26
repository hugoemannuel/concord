-- Atualização obrigatória e novidades em destaque (ADR 0066): a release que
-- exige atualizar quem tem versão anterior e as notas que vão para o modal de
-- novidades.
ALTER TABLE changelog_releases ADD COLUMN IF NOT EXISTS required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE changelog_entries ADD COLUMN IF NOT EXISTS highlight BOOLEAN NOT NULL DEFAULT FALSE;
