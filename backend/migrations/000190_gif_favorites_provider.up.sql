-- Provedor do GIF favorito (docs/adr/0053-klipy-no-lugar-do-giphy.md): os
-- favoritos que já existem são do GIPHY (o DEFAULT cobre as linhas antigas);
-- os novos guardam 'klipy'. O gif_id continua sendo o id do provedor.
ALTER TABLE gif_favorites
    ADD COLUMN provider VARCHAR(16) NOT NULL DEFAULT 'giphy';
