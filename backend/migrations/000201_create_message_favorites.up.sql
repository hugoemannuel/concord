-- Mensagens favoritas, por usuário (docs/adr/0061-mensagens-favoritas.md).
-- Só a referência: o conteúdo é o da mensagem (editada, mostra a edição).
-- Mensagem apagada (DELETE) leva o favorito junto. O limite por pessoa (500)
-- é aplicado no backend.
CREATE TABLE message_favorites (
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    message_id UUID NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, message_id)
);

-- Listagem do mais novo para o mais antigo.
CREATE INDEX idx_message_favorites_user_created ON message_favorites (user_id, created_at DESC);

-- A cascata do DELETE de messages acha os favoritos pela mensagem.
CREATE INDEX idx_message_favorites_message ON message_favorites (message_id);
