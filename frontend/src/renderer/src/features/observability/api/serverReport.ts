import { request } from '../../../shared/api/client'

// Painel do servidor (backend: internal/serverobs, GET /obs/server; só devs).
// ADR 0067. null = não deu para ler (ou sem dado no período).

export interface ApiMinute {
  minute: string
  requests: number
  status_5xx: number
  p95_ms: number | null
  panics: number
  ws_open: number
  goroutines: number
  heap_mb: number
  db_in_use: number
  db_idle: number
  db_max: number
}

export interface ApiPoint {
  at: string
  minutes: number
  requests: number
  status_4xx: number
  status_5xx: number
  p50_ms: number | null
  p95_ms: number | null
  max_ms: number | null
  panics: number
  ws_open: number
  ws_disconnects: number
  goroutines: number
  heap_mb: number
  db_in_use: number
  db_waits: number
}

export interface RouteRow {
  route: string
  requests: number
  status_4xx: number
  status_5xx: number
  avg_ms: number | null
  p95_ms: number | null
  max_ms: number | null
  total_ms: number
}

export interface HostMinute {
  minute: string
  cpu_pct: number | null
  steal_pct: number | null
  load1: number | null
  mem_used_pct: number | null
  mem_available_mb: number | null
  swap_used_mb: number | null
  disk_used_pct: number | null
  disk_free_bytes: number | null
  net_rx_bps: number | null
  net_tx_bps: number | null
  db_size_bytes: number | null
  db_connections: number | null
  backup_at: string | null
  backup_bytes: number | null
  boot_at: string | null
}

export interface HostPoint {
  at: string
  cpu_pct: number | null
  iowait_pct: number | null
  steal_pct: number | null
  load1: number | null
  mem_used_pct: number | null
  swap_used_mb: number | null
  disk_used_pct: number | null
  disk_read_bps: number | null
  disk_write_bps: number | null
  net_rx_bps: number | null
  net_tx_bps: number | null
  net_errors: number | null
  udp_rcvbuf_errors: number | null
  backend_cpu_pct: number | null
  backend_mem_mb: number | null
  postgres_cpu_pct: number | null
  postgres_mem_mb: number | null
}

export interface TableSize {
  name: string
  bytes: number
}

export interface ServerReport {
  from: string
  to: string
  bucket_minutes: number
  api: { latest: ApiMinute | null; series: ApiPoint[]; routes: RouteRow[] }
  host: { latest: HostMinute | null; series: HostPoint[]; tables: TableSize[] }
}

export function fetchServerReport(days: number): Promise<ServerReport> {
  return request<ServerReport>(`/obs/server?days=${days}`)
}
