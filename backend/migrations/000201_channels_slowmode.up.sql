-- Modo lento do canal: intervalo mínimo, em segundos, entre as mensagens de cada membro (0 = desligado; até 6 h).
ALTER TABLE channels ADD COLUMN IF NOT EXISTS slowmode_seconds INT NOT NULL DEFAULT 0
    CHECK (slowmode_seconds BETWEEN 0 AND 21600);
