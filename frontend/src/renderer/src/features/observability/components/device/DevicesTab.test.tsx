import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { DeviceReport } from '../../api/device/deviceReport'
import type { DeviceReportState } from '../../hooks/device/useDeviceReport'

const fetchDeviceReport = vi.hoisted(() => vi.fn(() => new Promise(() => {})))
vi.mock('../../api/device/deviceReport', () => ({ fetchDeviceReport }))

import DevicesTab, { DevicesTabBody } from './DevicesTab'

const report = (): DeviceReport => ({
  from: '2026-11-18T00:00:00Z',
  to: '2026-11-25T00:00:00Z',
  people: 12,
  samples: 3400,
  worst: [
    {
      user_id: 'u1',
      username: 'ana',
      os: 'Windows',
      gpu: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      app_version: '1.40.0',
      target: 'desktop',
      minutes: 340,
      cpu_app: 18.2,
      cpu_renderer_call: 22,
      mem_app_mb: 1450,
      mem_free_min_mb: 600,
      mem_total_mb: 8000,
      sys_cpu: 70,
      lag_p95_ms: 140,
      long_ms_per_min: 2300,
      slow_inputs: 4,
      hangs: 1,
      gpu_crashes: 0,
      software_gpu: true,
      ws_rtt_ms: 60,
      startup_ms: 9000,
      score: 7,
      reasons: ['Sem aceleração por hardware', 'Travadas longas']
    }
  ],
  baseline: [
    {
      state: 'call',
      samples: 900,
      people: 8,
      cpu_app_p50: 8.1,
      cpu_app_p90: 19,
      cpu_renderer_p50: 5,
      mem_app_p50: 700,
      mem_app_p90: 1200,
      lag_p95_p50: 10,
      long_ms_per_min_p50: 0
    }
  ],
  versions: [
    {
      app_version: '1.40.0',
      target: 'web',
      people: 5,
      samples: 800,
      cpu_app_call: 9,
      mem_app_mb: 760,
      lag_p95_p50: 11,
      long_ms_per_min: 120,
      hangs: 2,
      software_gpu_people: 1
    }
  ]
})

const render = (state: DeviceReportState): string =>
  renderToStaticMarkup(<DevicesTabBody state={state} onRetry={() => {}} />)

describe('DevicesTabBody', () => {
  it('mostra o resumo, os aparelhos piores, a linha de base e as versões', () => {
    const html = render({ status: 'ready', report: report() })
    for (const text of [
      '12 pessoas · 3.400 linhas no período',
      'Aparelhos mais pesados ou travados',
      'ana',
      'Windows',
      'NVIDIA GeForce RTX 3070',
      '1.40.0 · desktop',
      'Sem aceleração por hardware',
      'Travadas longas',
      'CPU do app 18,2% · renderer em call 22%',
      'janela parou 1 vez',
      'Consumo típico por estado',
      'Em call',
      '8,1%',
      '1,2 GB',
      'Por versão do app',
      '1.40.0 · web',
      '760 MB',
      '120 ms/min'
    ]) {
      expect(html).toContain(text)
    }
  })
  it('sem aparelho com problema, avisa', () => {
    const html = render({ status: 'ready', report: { ...report(), worst: [] } })
    expect(html).toContain('Nenhum aparelho com problema no período.')
  })
  it('estados: carregando, sem permissão e erro', () => {
    expect(render({ status: 'loading' })).toContain('aria-busy="true"')
    expect(render({ status: 'forbidden' })).toContain('Só para devs.')
    const error = render({ status: 'error' })
    expect(error).toContain('Não foi possível carregar os aparelhos.')
    expect(error).toContain('Tentar de novo')
  })
})

describe('DevicesTab', () => {
  it('começa carregando', () => {
    expect(renderToStaticMarkup(<DevicesTab days={7} />)).toContain('Carregando aparelhos…')
  })
})
