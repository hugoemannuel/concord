-- Registro de auditoria do servidor (internal/audit, docs/adr/0036-registro-de-auditoria.md).
-- Uma linha por ação de moderação ou administração. Some com o servidor
-- (ON DELETE CASCADE) e depois de 90 dias (audit.Retention). Nunca guarda
-- senha, token, código de convite nem conteúdo de mensagem.
CREATE TABLE server_audit_log (
    id BIGSERIAL PRIMARY KEY,
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    -- Quem fez (sem FK: o nome sai de users na consulta e a linha fica mesmo
    -- que a conta suma).
    actor_id UUID,
    action VARCHAR(48) NOT NULL,
    -- Em quem/no quê: member, channel, role, server, invite, emoji, sticker,
    -- sound, event. O nome é o da hora da ação (o alvo pode ter sido apagado).
    target_type VARCHAR(16) NOT NULL DEFAULT '',
    target_id TEXT NOT NULL DEFAULT '',
    target_name TEXT NOT NULL DEFAULT '',
    -- Onde (mensagem apagada, voz, permissão de canal).
    channel_id TEXT NOT NULL DEFAULT '',
    channel_name TEXT NOT NULL DEFAULT '',
    -- O que mudou: [{field, before, after}].
    changes JSONB NOT NULL DEFAULT '[]'::jsonb,
    reason TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A tela lê do mais recente para o mais antigo, com filtro por quem fez ou por ação.
CREATE INDEX idx_server_audit_log_server ON server_audit_log (server_id, id DESC);
CREATE INDEX idx_server_audit_log_actor ON server_audit_log (server_id, actor_id, id DESC);
CREATE INDEX idx_server_audit_log_action ON server_audit_log (server_id, action, id DESC);
-- Retenção: apaga o que passou de 90 dias.
CREATE INDEX idx_server_audit_log_created ON server_audit_log (created_at);
