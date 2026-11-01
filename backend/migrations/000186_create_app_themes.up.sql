-- Temas próprios da aparência do app por pessoa (docs/adr/0040-aparencia-personalizada.md):
-- lista de até 10 temas ({id, name, accent, background, sidebar, card, text, glow}),
-- validada pelo backend. Sem linha = nenhum tema próprio. Qual tema está em uso
-- fica em cada aparelho.
CREATE TABLE user_app_themes (
    user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    themes JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
