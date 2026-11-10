-- Castigo nas calls (docs/adr/0063-castigo-na-call.md): até quando cada efeito
-- vale para a pessoa no servidor. NULL = o efeito não vale. Uma linha por
-- pessoa e servidor; castigos somados ficam com o prazo mais longo.
CREATE TABLE IF NOT EXISTS castigos (
    server_id UUID NOT NULL REFERENCES servers (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    speak_until TIMESTAMPTZ NULL,
    connect_until TIMESTAMPTZ NULL,
    listen_until TIMESTAMPTZ NULL,
    PRIMARY KEY (server_id, user_id)
);
