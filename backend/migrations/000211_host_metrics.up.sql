-- Métricas da VPS (internal/serverobs, ADR 0067), lidas do /proc e do statfs.
-- Uma linha por minuto; nulo = não deu para ler (ou fora do Linux). Taxas e
-- contadores = no minuto; o resto = no momento da coleta. CPU de processo em %
-- da máquina inteira (todas as vCPUs), como cpu_pct. *_bps = BYTES por
-- segundo (não bits); *_pps = pacotes por segundo. Retenção de 14 dias.
CREATE TABLE host_metrics (
    minute TIMESTAMPTZ PRIMARY KEY,
    seconds REAL NOT NULL DEFAULT 0,
    cpu_pct REAL,
    iowait_pct REAL,
    steal_pct REAL,
    load1 REAL,
    load5 REAL,
    load15 REAL,
    mem_used_pct REAL,
    mem_available_mb REAL,
    swap_used_mb REAL,
    disk_used_bytes BIGINT,
    disk_free_bytes BIGINT,
    disk_used_pct REAL,
    inodes_used_pct REAL,
    disk_read_bps REAL,
    disk_write_bps REAL,
    disk_busy_pct REAL,
    net_rx_bps REAL,
    net_tx_bps REAL,
    net_rx_pps REAL,
    net_tx_pps REAL,
    net_errors BIGINT,
    net_drops BIGINT,
    udp_in_errors BIGINT,
    udp_rcvbuf_errors BIGINT,
    udp_sndbuf_errors BIGINT,
    backend_cpu_pct REAL,
    backend_mem_mb REAL,
    postgres_cpu_pct REAL,
    postgres_mem_mb REAL,
    db_size_bytes BIGINT,
    db_connections INT,
    backup_at TIMESTAMPTZ,
    backup_bytes BIGINT,
    boot_at TIMESTAMPTZ
);

-- db_table_sizes: as 10 maiores tabelas (com índices e TOAST), de hora em hora.
CREATE TABLE db_table_sizes (
    hour TIMESTAMPTZ NOT NULL,
    table_name TEXT NOT NULL,
    total_bytes BIGINT NOT NULL,
    PRIMARY KEY (hour, table_name)
);
