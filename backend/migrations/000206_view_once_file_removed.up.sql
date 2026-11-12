ALTER TABLE message_attachments ADD COLUMN view_once_file_removed BOOLEAN NOT NULL DEFAULT false; -- arquivo já saiu do disco (retoma se o processo cair entre marcar e apagar)
UPDATE message_attachments SET view_once_file_removed = true WHERE view_once_gone_at IS NOT NULL;
