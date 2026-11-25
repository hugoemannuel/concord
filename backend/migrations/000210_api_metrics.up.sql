-- Métricas da API (internal/serverobs, ADR 0067). Retenção de 14 dias (o
-- backend apaga o que passou disso).
--
-- api_metrics: uma linha por minuto (minute = minuto da coleta; os números são
-- do minuto anterior a ele). Contadores = no minuto; inflight, ws_open, goroutines,
-- heap/sys e o pool do banco = no momento da coleta. Latência em ms, estimada
-- por baldes fixos (o máximo é exato); nula sem pedido no minuto.
CREATE TABLE api_metrics (
    minute TIMESTAMPTZ PRIMARY KEY,
    seconds REAL NOT NULL DEFAULT 0,
    requests INT NOT NULL DEFAULT 0,
    status_2xx INT NOT NULL DEFAULT 0,
    status_3xx INT NOT NULL DEFAULT 0,
    status_4xx INT NOT NULL DEFAULT 0,
    status_5xx INT NOT NULL DEFAULT 0,
    p50_ms REAL,
    p95_ms REAL,
    p99_ms REAL,
    max_ms REAL,
    inflight INT NOT NULL DEFAULT 0,
    inflight_max INT NOT NULL DEFAULT 0,
    panics INT NOT NULL DEFAULT 0,
    ws_open INT NOT NULL DEFAULT 0,
    ws_connects INT NOT NULL DEFAULT 0,
    ws_disconnects INT NOT NULL DEFAULT 0,
    goroutines INT NOT NULL DEFAULT 0,
    heap_mb REAL NOT NULL DEFAULT 0,
    sys_mb REAL NOT NULL DEFAULT 0,
    gc_cycles INT NOT NULL DEFAULT 0,
    gc_pause_ms REAL NOT NULL DEFAULT 0,
    gc_pause_max_ms REAL NOT NULL DEFAULT 0,
    db_in_use INT NOT NULL DEFAULT 0,
    db_idle INT NOT NULL DEFAULT 0,
    db_total INT NOT NULL DEFAULT 0,
    db_max INT NOT NULL DEFAULT 0,
    db_waits INT NOT NULL DEFAULT 0,
    db_wait_ms REAL NOT NULL DEFAULT 0
);

-- api_route_metrics: de 5 em 5 minutos (minute = fim da janela), até 20 rotas
-- por janela: as com 5xx primeiro, depois as que mais gastaram tempo. route =
-- método + padrão do gin (ex. "GET /api/channels/:id/messages"), nunca a URL;
-- "(sem rota)" = 404 sem rota.
CREATE TABLE api_route_metrics (
    minute TIMESTAMPTZ NOT NULL,
    route TEXT NOT NULL,
    requests INT NOT NULL DEFAULT 0,
    status_4xx INT NOT NULL DEFAULT 0,
    status_5xx INT NOT NULL DEFAULT 0,
    p50_ms REAL,
    p95_ms REAL,
    max_ms REAL,
    total_ms REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (minute, route)
);
