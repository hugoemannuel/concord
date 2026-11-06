import { afterEach, describe, expect, it, vi } from 'vitest'

const stats = vi.hoisted(() => ({
  current: {
    history: [] as { time: number; ms: number }[],
    ceiling: 100,
    metrics: null as { memoryMB: number | null; cpuPercent: number | null } | null,
    pending: true,
    warmingCPU: true
  }
}))
vi.mock('../hooks/useConnectionStats', () => ({ useConnectionStats: () => stats.current }))
// Sem DOM: o portal vira o próprio conteúdo.
vi.mock('react-dom', async (original) => ({
  ...(await original<typeof import('react-dom')>()),
  createPortal: (node: React.ReactNode) => node
}))

import { renderToStaticMarkup } from 'react-dom/server'
import ConnectionStatsPopover from './ConnectionStatsPopover'

function render({ desktop = false, width = 1280 } = {}): string {
  vi.stubGlobal('window', {
    innerWidth: width,
    innerHeight: 800,
    api: desktop ? { appMetrics: () => {} } : undefined
  })
  vi.stubGlobal('document', { body: {} })
  const anchor = {
    getBoundingClientRect: () => ({ left: 20, top: 600 }),
    contains: () => false
  } as unknown as HTMLElement
  return renderToStaticMarkup(<ConnectionStatsPopover anchor={anchor} onClose={() => {}} />)
}

describe('ConnectionStatsPopover', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('medindo, no navegador: "Medindo…" e o aviso das métricas do desktop', () => {
    stats.current = { history: [], ceiling: 100, metrics: null, pending: true, warmingCPU: true }
    const html = render()
    expect(html).toContain('Conexão de voz')
    expect(html).toContain('Medindo…')
    expect(html).toContain('Métricas de recursos disponíveis no aplicativo desktop.')
  })

  it('no desktop com dados: ping, RAM e CPU', () => {
    const now = Date.UTC(2026, 0, 1, 12)
    stats.current = {
      history: [
        { time: now - 2000, ms: 40 },
        { time: now, ms: 60 }
      ],
      ceiling: 100,
      metrics: { memoryMB: 312.4, cpuPercent: 3.25 },
      pending: false,
      warmingCPU: false
    }
    const html = render({ desktop: true })
    expect(html).toContain('50 ms')
    expect(html).toContain('60 ms')
    expect(html).toContain('312 MB')
    expect(html).toContain('3,3%')
  })

  it('no desktop sem métricas: CPU aquecendo mede, RAM fica indisponível', () => {
    stats.current = {
      history: [],
      ceiling: 100,
      metrics: { memoryMB: null, cpuPercent: null },
      pending: false,
      warmingCPU: true
    }
    const html = render({ desktop: true })
    expect(html).toContain('Indisponível')
    expect(html).toContain('Medindo…')
    expect(html).toContain('Sem dados')
  })

  it('em 360 px cabe na janela, com margem', () => {
    stats.current = { history: [], ceiling: 100, metrics: null, pending: true, warmingCPU: true }
    expect(render({ width: 360 })).toContain('width:300px;left:20px')
    expect(render({ width: 300 })).toContain('width:284px;left:8px')
  })
})
