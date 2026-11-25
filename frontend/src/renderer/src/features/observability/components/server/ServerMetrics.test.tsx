import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ServerReport } from '../../api/serverReport'
import { ServerMetrics } from './ServerMetrics'

const now = Date.parse('2026-11-25T12:00:00Z')

const report: ServerReport = {
  from: '2026-11-24T12:00:00Z',
  to: '2026-11-25T12:00:00Z',
  bucket_minutes: 5,
  api: {
    latest: {
      minute: '2026-11-25T11:59:00Z',
      requests: 40,
      status_5xx: 0,
      p95_ms: 30,
      panics: 0,
      ws_open: 12,
      goroutines: 80,
      heap_mb: 40,
      db_in_use: 2,
      db_idle: 3,
      db_max: 16
    },
    series: [
      {
        at: '2026-11-25T11:55:00Z',
        minutes: 5,
        requests: 200,
        status_4xx: 3,
        status_5xx: 4,
        p50_ms: 5,
        p95_ms: 120,
        max_ms: 900,
        panics: 1,
        ws_open: 12,
        ws_disconnects: 0,
        goroutines: 80,
        heap_mb: 40,
        db_in_use: 2,
        db_waits: 0
      }
    ],
    routes: [
      {
        route: 'GET /api/channels/:id/messages',
        requests: 120,
        status_4xx: 0,
        status_5xx: 4,
        avg_ms: 25,
        p95_ms: 120,
        max_ms: 900,
        total_ms: 3000
      }
    ]
  },
  host: {
    latest: {
      minute: '2026-11-25T11:59:00Z',
      cpu_pct: 35,
      steal_pct: 1,
      load1: 0.8,
      mem_used_pct: 70,
      mem_available_mb: 1200,
      swap_used_mb: 0,
      disk_used_pct: 91,
      disk_free_bytes: 4e9,
      net_rx_bps: 125000,
      net_tx_bps: 250000,
      db_size_bytes: 3e8,
      db_connections: 12,
      backup_at: '2026-11-25T03:00:00Z',
      backup_bytes: 5e7,
      boot_at: '2026-11-20T10:00:00Z'
    },
    series: [],
    tables: [{ name: 'messages', bytes: 2e8 }]
  }
}

const render = (state: Parameters<typeof ServerMetrics>[0]['state']): string =>
  renderToStaticMarkup(<ServerMetrics state={state} now={now} onRetry={() => {}} />)

describe('ServerMetrics', () => {
  it('carregando, sem acesso e erro', () => {
    expect(render({ status: 'loading' })).toContain('Carregando')
    expect(render({ status: 'forbidden' })).toContain('Só os devs')
    expect(render({ status: 'error' })).toContain('Tentar de novo')
  })

  it('mostra os blocos VPS e API com as rotas pelo padrão do gin', () => {
    const html = render({ status: 'ready', report })
    expect(html).toContain('VPS')
    expect(html).toContain('API')
    expect(html).toContain('GET /api/channels/:id/messages')
    expect(html).toContain('messages')
    expect(html).toContain('há 9 h')
    expect(html).toContain('Última coleta')
    expect(html).not.toContain('parada')
  })

  it('o disco acima do limite aparece em aviso', () => {
    expect(render({ status: 'ready', report })).toMatch(/text-warning[^>]*>91%/)
  })

  it('sem linhas no período diz que não há métricas', () => {
    const empty: ServerReport = {
      ...report,
      api: { latest: null, series: [], routes: [] },
      host: { latest: null, series: [], tables: [] }
    }
    const html = render({ status: 'ready', report: empty })
    expect(html).toContain('Sem métricas da VPS no período.')
    expect(html).toContain('Sem métricas da API no período.')
  })
})
