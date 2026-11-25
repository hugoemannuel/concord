-- Sinais novos de mídia (ADR 0074): cada coluna responde uma pergunta que leva
-- a uma ação (tabela no ADR). Todas nulas: versões antigas do app e os outros
-- tipos de sessão não mandam. Só números e nomes técnicos.
ALTER TABLE live_samples
    -- transmite: QP médio do intervalo (qualidade da imagem no bitrate do momento;
    -- a escala é a do codec).
    ADD COLUMN qp REAL,
    -- 1ª amostra: transmite = ms do OK no seletor até a live publicada;
    -- assiste = ms do "assistir" até o primeiro quadro no vídeo.
    ADD COLUMN start_ms INT,
    -- transmite: tamanho da fonte (monitor ou janela) antes de reduzir.
    ADD COLUMN source_width INT,
    ADD COLUMN source_height INT,
    -- transmite: monitor, window ou browser (o tipo, nunca o título).
    ADD COLUMN surface TEXT,
    -- call: % do tempo em que o processamento do microfone atrasou (underrun).
    ADD COLUMN dsp_underrun_pct REAL,
    -- call: o que estava ligado no microfone ("rnnoise · voz:robo · portão").
    ADD COLUMN dsp TEXT,
    -- call: % do áudio tocado que a saída do PC teve de sintetizar (media-playout).
    ADD COLUMN playout_synth_pct REAL,
    -- call: a minha câmera enviada (quadros/s, altura e limitação) e os
    -- congelamentos das câmeras que eu recebo (somados) no intervalo.
    ADD COLUMN cam_fps REAL,
    ADD COLUMN cam_height INT,
    ADD COLUMN cam_limitation TEXT,
    ADD COLUMN cam_freezes INT;
