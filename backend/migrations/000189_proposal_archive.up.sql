-- Propostas concluídas/recusadas podem ser arquivadas pelo time tech: somem do
-- quadro, mas nada é apagado (votos, comentários, imagens, issue, badges).
ALTER TABLE proposals ADD COLUMN archived_at TIMESTAMPTZ;

CREATE INDEX proposals_archived_idx ON proposals (archived_at DESC) WHERE archived_at IS NOT NULL;
