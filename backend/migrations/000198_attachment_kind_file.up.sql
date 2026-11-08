-- Anexo de qualquer tipo no chat (pdf, zip, código...): kind 'file'.
ALTER TABLE message_attachments DROP CONSTRAINT IF EXISTS message_attachments_kind_check;
ALTER TABLE message_attachments
    ADD CONSTRAINT message_attachments_kind_check CHECK (kind IN ('image', 'video', 'audio', 'file'));
