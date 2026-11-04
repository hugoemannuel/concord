-- Desfaz só a coluna: os favoritos da KLIPY ficam na tabela (com a URL dela), o
-- que o código antigo não consegue favoritar mas também não quebra ao listar.
ALTER TABLE gif_favorites
    DROP COLUMN provider;
