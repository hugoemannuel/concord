-- Mensagem encaminhada (message/forward.go): de onde ela veio (autor, canal,
-- servidor ou DM), foto do momento do encaminhamento. NULL = mensagem comum.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS forwarded_from JSONB;
