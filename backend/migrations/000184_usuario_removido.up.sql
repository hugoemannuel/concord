-- Conta "Usuário removido" (docs/adr/0038-excluir-a-propria-conta.md). Quem
-- exclui a conta some do banco (as FKs com ON DELETE CASCADE levam o resto),
-- mas as mensagens que mandou em servidores e grupos ficam, como no Discord:
-- messages.author_id, message_attachments.uploader_id e channels.created_by
-- passam para esta conta antes do DELETE. Ela não entra (senha '!' que nenhum
-- bcrypt aceita), não aparece na busca nem recebe pedido de amizade
-- (active = false) e não é visitante (a limpeza dos visitantes não a apaga).
INSERT INTO users (id, username, display_name, email, password_hash, active, friend_request_policy, allow_server_dms)
VALUES (
    '00000000-0000-4000-8000-000000000000',
    'usuario-removido',
    'Usuário removido',
    'usuario-removido@salinha.invalid',
    '!',
    FALSE,
    'nobody',
    FALSE
)
ON CONFLICT (id) DO NOTHING;
