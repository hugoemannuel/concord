-- Atenção: o down APAGA os anexos 'file' (as linhas; os arquivos no disco
-- ficam para a limpeza de órfãos), senão o CHECK antigo não volta.
DELETE FROM message_attachments WHERE kind = 'file';
ALTER TABLE message_attachments DROP CONSTRAINT IF EXISTS message_attachments_kind_check;
ALTER TABLE message_attachments
    ADD CONSTRAINT message_attachments_kind_check CHECK (kind IN ('image', 'video', 'audio'));
