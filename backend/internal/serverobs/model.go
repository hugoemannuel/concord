// Package serverobs guarda, a cada minuto, a saúde da API e da VPS no Postgres
// e monta o painel do servidor (docs/adr/0067-metricas-da-api-e-da-vps.md).
package serverobs

import "time"

// APIMinute: uma linha de api_metrics. Latência em ms (nil sem pedido).
type APIMinute struct {
	Minute        time.Time `json:"minute"`
	Seconds       float64   `json:"seconds"`
	Requests      int       `json:"requests"`
	Status2xx     int       `json:"status_2xx"`
	Status3xx     int       `json:"status_3xx"`
	Status4xx     int       `json:"status_4xx"`
	Status5xx     int       `json:"status_5xx"`
	P50Ms         *float64  `json:"p50_ms"`
	P95Ms         *float64  `json:"p95_ms"`
	P99Ms         *float64  `json:"p99_ms"`
	MaxMs         *float64  `json:"max_ms"`
	InFlight      int       `json:"inflight"`
	InFlightMax   int       `json:"inflight_max"`
	Panics        int       `json:"panics"`
	WSOpen        int       `json:"ws_open"`
	WSConnects    int       `json:"ws_connects"`
	WSDisconnects int       `json:"ws_disconnects"`
	Goroutines    int       `json:"goroutines"`
	HeapMB        float64   `json:"heap_mb"`
	SysMB         float64   `json:"sys_mb"`
	GCCycles      int       `json:"gc_cycles"`
	GCPauseMs     float64   `json:"gc_pause_ms"`
	GCPauseMaxMs  float64   `json:"gc_pause_max_ms"`
	DBInUse       int       `json:"db_in_use"`
	DBIdle        int       `json:"db_idle"`
	DBTotal       int       `json:"db_total"`
	DBMax         int       `json:"db_max"`
	DBWaits       int       `json:"db_waits"`
	DBWaitMs      float64   `json:"db_wait_ms"`
}

// RouteWindow: uma linha de api_route_metrics (5 min, Minute = fim da janela).
type RouteWindow struct {
	Minute    time.Time `json:"minute"`
	Route     string    `json:"route"`
	Requests  int       `json:"requests"`
	Status4xx int       `json:"status_4xx"`
	Status5xx int       `json:"status_5xx"`
	P50Ms     *float64  `json:"p50_ms"`
	P95Ms     *float64  `json:"p95_ms"`
	MaxMs     *float64  `json:"max_ms"`
	TotalMs   float64   `json:"total_ms"`
}

// HostMinute: uma linha de host_metrics (nil = não deu para ler).
type HostMinute struct {
	Minute          time.Time  `json:"minute"`
	Seconds         float64    `json:"seconds"`
	CPUPct          *float64   `json:"cpu_pct"`
	IOWaitPct       *float64   `json:"iowait_pct"`
	StealPct        *float64   `json:"steal_pct"`
	Load1           *float64   `json:"load1"`
	Load5           *float64   `json:"load5"`
	Load15          *float64   `json:"load15"`
	MemUsedPct      *float64   `json:"mem_used_pct"`
	MemAvailableMB  *float64   `json:"mem_available_mb"`
	SwapUsedMB      *float64   `json:"swap_used_mb"`
	DiskUsedBytes   *int64     `json:"disk_used_bytes"`
	DiskFreeBytes   *int64     `json:"disk_free_bytes"`
	DiskUsedPct     *float64   `json:"disk_used_pct"`
	InodesUsedPct   *float64   `json:"inodes_used_pct"`
	DiskReadBps     *float64   `json:"disk_read_bps"`
	DiskWriteBps    *float64   `json:"disk_write_bps"`
	DiskBusyPct     *float64   `json:"disk_busy_pct"`
	NetRxBps        *float64   `json:"net_rx_bps"`
	NetTxBps        *float64   `json:"net_tx_bps"`
	NetRxPps        *float64   `json:"net_rx_pps"`
	NetTxPps        *float64   `json:"net_tx_pps"`
	NetErrors       *int64     `json:"net_errors"`
	NetDrops        *int64     `json:"net_drops"`
	UDPInErrors     *int64     `json:"udp_in_errors"`
	UDPRcvbufErrors *int64     `json:"udp_rcvbuf_errors"`
	UDPSndbufErrors *int64     `json:"udp_sndbuf_errors"`
	BackendCPUPct   *float64   `json:"backend_cpu_pct"`
	BackendMemMB    *float64   `json:"backend_mem_mb"`
	PostgresCPUPct  *float64   `json:"postgres_cpu_pct"`
	PostgresMemMB   *float64   `json:"postgres_mem_mb"`
	DBSizeBytes     *int64     `json:"db_size_bytes"`
	DBConnections   *int       `json:"db_connections"`
	BackupAt        *time.Time `json:"backup_at"`
	BackupBytes     *int64     `json:"backup_bytes"`
	BootAt          *time.Time `json:"boot_at"`
}

// TableSize: tamanho de uma tabela com índices e TOAST.
type TableSize struct {
	Name  string `json:"name"`
	Bytes int64  `json:"bytes"`
}
