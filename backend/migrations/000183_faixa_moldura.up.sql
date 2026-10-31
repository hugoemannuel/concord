-- Faixa (placa atrás do nome nas listas) e moldura do avatar (#482).
-- nameplate_mode: 'off' (padrão: ninguém ganha faixa sem pedir), 'banner' (usa
-- o banner) ou 'custom' (usa nameplate_url, a imagem enviada).
ALTER TABLE users
  ADD COLUMN nameplate_mode TEXT NOT NULL DEFAULT 'off'
    CHECK (nameplate_mode IN ('off', 'banner', 'custom')),
  ADD COLUMN nameplate_url TEXT,
  ADD COLUMN avatar_decoration_url TEXT;
