-- Métricas do aparelho (internal/deviceobs, ADR 0069): o app agrega por
-- minuto (1 por minuto em call ou live, 1 a cada 5 minutos parado) a CPU e a
-- memória do próprio app, o estado da máquina, se a interface travou e a rede
-- do app. Só números do app e do sistema: nunca a lista de programas, janelas
-- ou processos de outras coisas. Retenção de 14 dias (o backend apaga).
-- Apagar a conta apaga tudo.

-- Uma abertura do app (o id é gerado no app a cada abertura).
CREATE TABLE device_sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    os TEXT NOT NULL DEFAULT '',
    app_version TEXT NOT NULL DEFAULT '',
    -- desktop ou web.
    target TEXT NOT NULL DEFAULT '',
    gpu TEXT NOT NULL DEFAULT '',
    -- núcleos lógicos (0 = não contou).
    cores INT NOT NULL DEFAULT 0,
    -- memória total da máquina (vazio no web).
    mem_total_mb INT,
    -- do início do processo (ou da navegação) até a lista de servidores chegar.
    startup_ms INT,
    -- enabled, software (composição por software), disabled ou '' (não sabe).
    gpu_status TEXT NOT NULL DEFAULT '',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX device_sessions_last_seen_idx ON device_sessions (last_seen_at);
CREATE INDEX device_sessions_user_idx ON device_sessions (user_id, last_seen_at);

-- Uma linha agregada: cobre os `seconds` antes de `at`. cpu_* é % da máquina
-- inteira (média; cpu_app_max é o máximo das leituras de 15 s). Os contadores
-- (hangs, gpu_crashes, long_count, slow_inputs, api_count) são do intervalo.
-- Vazio = não medido (lag e quadros longos só contam com a janela visível).
CREATE TABLE device_samples (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES device_sessions (id) ON DELETE CASCADE,
    at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    seconds REAL NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('parado', 'call', 'transmitindo')),
    -- assistindo alguma live.
    watching BOOLEAN NOT NULL DEFAULT FALSE,
    -- jogo aberto: só com a atividade ligada; senão vazio.
    game BOOLEAN,
    visible_pct REAL,
    focused_pct REAL,
    cpu_browser REAL,
    cpu_renderer REAL,
    cpu_gpu REAL,
    cpu_other REAL,
    cpu_app_max REAL,
    mem_app_mb REAL,
    mem_renderer_mb REAL,
    mem_gpu_mb REAL,
    -- filhos nativos (concord-live e afins): só no Linux.
    cpu_helpers REAL,
    mem_helpers_mb REAL,
    sys_cpu_pct REAL,
    sys_mem_free_mb REAL,
    -- carga de 1 minuto (não existe no Windows).
    load_avg REAL,
    on_battery BOOLEAN,
    -- limite de velocidade da CPU anunciado pelo SO (Windows/macOS).
    speed_limit_pct REAL,
    -- a janela parou de responder.
    hangs INT NOT NULL DEFAULT 0,
    -- o processo da GPU caiu.
    gpu_crashes INT NOT NULL DEFAULT 0,
    lag_p95_ms REAL,
    lag_max_ms REAL,
    long_count INT NOT NULL DEFAULT 0,
    long_ms REAL,
    long_max_ms REAL,
    -- interações de 200 ms ou mais.
    slow_inputs INT NOT NULL DEFAULT 0,
    input_max_ms REAL,
    heap_mb REAL,
    ws_rtt_ms REAL,
    ws_rtt_max_ms REAL,
    api_ms_p50 REAL,
    api_ms_p95 REAL,
    api_count INT NOT NULL DEFAULT 0
);
CREATE INDEX device_samples_session_idx ON device_samples (session_id);
CREATE INDEX device_samples_at_idx ON device_samples (at);
