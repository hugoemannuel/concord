-- Só sai se nenhuma mensagem foi passada para ela (senão o DELETE falharia
-- pelas FKs sem cascata): nesse caso a conta fica.
DELETE FROM users u
WHERE u.id = '00000000-0000-4000-8000-000000000000'
AND NOT EXISTS (SELECT 1 FROM messages WHERE author_id = u.id)
AND NOT EXISTS (SELECT 1 FROM message_attachments WHERE uploader_id = u.id)
AND NOT EXISTS (SELECT 1 FROM channels WHERE created_by = u.id);
