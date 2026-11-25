package serverobs

import "time"

// Painel do servidor (GET /api/obs/server, só devs).

// ServerReport: a última linha e as séries em baldes de cada bloco.
type ServerReport struct {
	From          time.Time  `json:"from"`
	To            time.Time  `json:"to"`
	BucketMinutes int        `json:"bucket_minutes"`
	API           APIReport  `json:"api"`
	Host          HostReport `json:"host"`
}

type APIReport struct {
	Latest *APIMinute `json:"latest"`
	Series []APIPoint `json:"series"`
	Routes []RouteRow `json:"routes"`
}

type HostReport struct {
	Latest *HostMinute `json:"latest"`
	Series []HostPoint `json:"series"`
	Tables []TableSize `json:"tables"`
}

// APIPoint: um balde. Somas para contadores, pior valor para latência e
// gauges (p95, conexões, pool), média para p50.
type APIPoint struct {
	At            time.Time `json:"at"`
	Minutes       int       `json:"minutes"`
	Requests      int       `json:"requests"`
	Status4xx     int       `json:"status_4xx"`
	Status5xx     int       `json:"status_5xx"`
	P50Ms         *float64  `json:"p50_ms"`
	P95Ms         *float64  `json:"p95_ms"`
	MaxMs         *float64  `json:"max_ms"`
	Panics        int       `json:"panics"`
	WSOpen        int       `json:"ws_open"`
	WSDisconnects int       `json:"ws_disconnects"`
	Goroutines    int       `json:"goroutines"`
	HeapMB        float64   `json:"heap_mb"`
	DBInUse       int       `json:"db_in_use"`
	DBWaits       int       `json:"db_waits"`
}

// HostPoint: um balde. Média para CPU, rede e disco; pior valor para
// memória, swap, disco usado e carga; soma para os erros.
type HostPoint struct {
	At              time.Time `json:"at"`
	CPUPct          *float64  `json:"cpu_pct"`
	IOWaitPct       *float64  `json:"iowait_pct"`
	StealPct        *float64  `json:"steal_pct"`
	Load1           *float64  `json:"load1"`
	MemUsedPct      *float64  `json:"mem_used_pct"`
	SwapUsedMB      *float64  `json:"swap_used_mb"`
	DiskUsedPct     *float64  `json:"disk_used_pct"`
	DiskReadBps     *float64  `json:"disk_read_bps"`
	DiskWriteBps    *float64  `json:"disk_write_bps"`
	NetRxBps        *float64  `json:"net_rx_bps"`
	NetTxBps        *float64  `json:"net_tx_bps"`
	NetErrors       *int64    `json:"net_errors"`
	UDPRcvbufErrors *int64    `json:"udp_rcvbuf_errors"`
	BackendCPUPct   *float64  `json:"backend_cpu_pct"`
	BackendMemMB    *float64  `json:"backend_mem_mb"`
	PostgresCPUPct  *float64  `json:"postgres_cpu_pct"`
	PostgresMemMB   *float64  `json:"postgres_mem_mb"`
}

// RouteRow: uma rota no período (somada das janelas de 5 min).
type RouteRow struct {
	Route     string   `json:"route"`
	Requests  int      `json:"requests"`
	Status4xx int      `json:"status_4xx"`
	Status5xx int      `json:"status_5xx"`
	AvgMs     *float64 `json:"avg_ms"`
	P95Ms     *float64 `json:"p95_ms"`
	MaxMs     *float64 `json:"max_ms"`
	TotalMs   float64  `json:"total_ms"`
}
