ALTER TABLE conversations ADD COLUMN disappearing_seconds INTEGER
  CHECK (disappearing_seconds IN (86400, 604800, 7776000));         -- NULL = desativado
ALTER TABLE messages ADD COLUMN expires_at TIMESTAMPTZ;             -- NULL = não expira
CREATE INDEX messages_expires_at_idx ON messages (expires_at) WHERE expires_at IS NOT NULL;
ALTER TABLE message_attachments ADD COLUMN view_once BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE message_attachments ADD COLUMN view_once_gone_at TIMESTAMPTZ; -- arquivo apagado (todos viram / 14 dias)
CREATE TABLE view_once_recipients (   -- quem podia abrir, gravado no envio
  attachment_id UUID NOT NULL REFERENCES message_attachments(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (attachment_id, user_id)
);
CREATE TABLE attachment_views (
  attachment_id UUID NOT NULL REFERENCES message_attachments(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (attachment_id, user_id)
);
