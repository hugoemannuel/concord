import { describe, expect, it } from 'vitest'
import type { ApiPoint, HostMinute, HostPoint, ServerReport } from '../api/serverReport'
import { ageLabel, apiSummary, bytesLabel, hostSummary, mbps } from './serverHealth'

const apiPoint = (p: Partial<ApiPoint>): ApiPoint => ({
  at: '2026-11-25T12:00:00Z',
  minutes: 5,
  requests: 0,
  status_4xx: 0,
  status_5xx: 0,
  p50_ms: null,
  p95_ms: null,
  max_ms: null,
  panics: 0,
  ws_open: 0,
  ws_disconnects: 0,
  goroutines: 0,
  heap_mb: 0,
  db_in_use: 0,
  db_waits: 0,
  ...p
})

const hostPoint = (p: Partial<HostPoint>): HostPoint => ({
  at: '2026-11-25T12:00:00Z',
  cpu_pct: null,
  cpu_max_pct: null,
  iowait_pct: null,
  steal_pct: null,
  load1: null,
  mem_used_pct: null,
  swap_used_mb: null,
  disk_used_pct: null,
  disk_read_bps: null,
  disk_write_bps: null,
  net_rx_bps: null,
  net_tx_bps: null,
  net_errors: null,
  udp_rcvbuf_errors: null,
  backend_cpu_pct: null,
  backend_mem_mb: null,
  postgres_cpu_pct: null,
  postgres_mem_mb: null,
  ...p
})

const latestHost: HostMinute = {
  minute: '2026-11-25T12:00:00Z',
  cpu_pct: 20,
  steal_pct: 1,
  load1: 0.5,
  mem_used_pct: 91,
  mem_available_mb: 300,
  swap_used_mb: 0,
  disk_used_pct: 40,
  disk_free_bytes: 20e9,
  net_rx_bps: 125000,
  net_tx_bps: 250000,
  db_size_bytes: 3e8,
  db_connections: 12,
  backup_at: '2026-11-24T03:00:00Z',
  backup_bytes: 5e7,
  boot_at: '2026-11-20T10:00:00Z'
}

describe('rótulos', () => {
  it('bytes em B, KB, MB, GB', () => {
    expect(bytesLabel(null)).toBe('—')
    expect(bytesLabel(512)).toBe('512 B')
    expect(bytesLabel(1536)).toBe('1,5 KB')
    expect(bytesLabel(20e9)).toBe('18,6 GB')
  })
  it('bytes por segundo em Mbps', () => {
    expect(mbps(125000)).toBe(1)
    expect(mbps(null)).toBeNull()
  })
  it('idade em min, h ou dias', () => {
    const now = Date.parse('2026-11-25T12:00:00Z')
    expect(ageLabel(null, now)).toBe('—')
    expect(ageLabel('2026-11-25T11:50:00Z', now)).toBe('há 10 min')
    expect(ageLabel('2026-11-24T03:00:00Z', now)).toBe('há 33 h')
    expect(ageLabel('2026-11-20T10:00:00Z', now)).toBe('há 5 dias')
  })
})

describe('apiSummary', () => {
  it('pedidos por minuto, 5xx, pior p95 e esperas no período', () => {
    const api: ServerReport['api'] = {
      latest: null,
      routes: [],
      series: [
        apiPoint({ minutes: 5, requests: 500, status_5xx: 2, p95_ms: 80, db_waits: 1 }),
        apiPoint({ minutes: 5, requests: 100, panics: 1, p95_ms: 300 })
      ]
    }
    expect(apiSummary(api)).toMatchObject({
      perMinute: 60,
      errors5xx: 2,
      worstP95: 300,
      panics: 1,
      dbWaits: 1
    })
  })
  it('sem minutos não divide por zero', () => {
    expect(apiSummary({ latest: null, routes: [], series: [] }).perMinute).toBeNull()
  })
})

describe('hostSummary', () => {
  it('agora, picos e os avisos', () => {
    const s = hostSummary(
      {
        latest: latestHost,
        tables: [],
        series: [
          hostPoint({ cpu_pct: 50, cpu_max_pct: 70, steal_pct: 12 }),
          hostPoint({ cpu_pct: 60, cpu_max_pct: 95, steal_pct: 2 })
        ]
      },
      Date.parse('2026-11-25T12:00:00Z')
    )
    expect(s.cpuPeak).toBe(95)
    expect(s.stealPeak).toBe(12)
    expect(s.warn).toEqual({ cpu: true, steal: true, memory: true, disk: false, backup: true })
  })
  it('o pico nunca fica abaixo do agora', () => {
    const s = hostSummary(
      {
        latest: { ...latestHost, cpu_pct: 97 },
        tables: [],
        series: [hostPoint({ cpu_max_pct: 60 })]
      },
      0
    )
    expect(s.cpuPeak).toBe(97)
  })
  it('sem nada, sem aviso', () => {
    const s = hostSummary({ latest: null, tables: [], series: [] }, 0)
    expect(s.cpuPeak).toBeNull()
    expect(s.warn).toEqual({ cpu: false, steal: false, memory: false, disk: false, backup: false })
  })
})
