-- Registro de auditoria do servidor (internal/audit). Uma linha por ação
-- administrativa; some junto com o servidor (ON DELETE CASCADE). O autor fica
-- como id mesmo que a pessoa saia ou apague a conta: o nome sai de users na
-- hora da consulta. Nunca guarda senha, token nem código de convite.
CREATE TABLE server_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    actor_id UUID,
    action VARCHAR(64) NOT NULL,
    target_type VARCHAR(32) NOT NULL DEFAULT '',
    target_id TEXT NOT NULL DEFAULT '',
    target_name TEXT NOT NULL DEFAULT '',
    changes JSONB,
    result VARCHAR(16) NOT NULL DEFAULT 'ok',
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_server_audit_logs_server ON server_audit_logs (server_id, created_at DESC, id DESC);
CREATE INDEX idx_server_audit_logs_actor ON server_audit_logs (server_id, actor_id, created_at DESC, id DESC);
CREATE INDEX idx_server_audit_logs_action ON server_audit_logs (server_id, action, created_at DESC, id DESC);
