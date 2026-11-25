import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { LiveReport, SessionStats } from '../../api/observability'
import type { ReportState } from '../../hooks/useLiveReport'
import { LiveReportContext } from '../../hooks/useSharedLiveReport'
import BreakdownTab from './BreakdownTab'
import CallsTab from './CallsTab'
import EventsTab from './EventsTab'
import LivesTab from './LivesTab'
import ServerTab from './ServerTab'

const base: SessionStats = {
  id: 's1',
  user_id: 'u1',
  username: 'ana',
  kind: 'transmite',
  call_id: 'c1',
  streamer_id: '',
  os: 'Windows',
  gpu: 'ANGLE (NVIDIA)',
  app_version: '1.0.0',
  target: 'desktop',
  cores: 8,
  network: '',
  device: '',
  backgrounds: 0,
  network_changes: 0,
  started_at: '2026-10-29T20:00:00Z',
  ended_at: '2026-10-29T20:30:00Z',
  seconds: 1800,
  codec: 'H265',
  transport: 'udp',
  fps: 55,
  target_fps: 60,
  height: 1080,
  hardware_ratio: 1,
  below_ratio: 0.25,
  cpu_ratio: 0.4,
  bandwidth_ratio: 0,
  backup_ratio: 0,
  paused_ratio: 0,
  freezes: 0,
  freeze_ms: 0,
  step_changes: 2,
  bitrate_kbps: 6000,
  loss_pct: 0.1,
  rtt_ms: 30,
  capture_fps: 58,
  recv_fps: null,
  codec_ms: 4,
  concealed_pct: null,
  recv_loss_pct: null,
  connect_ms: null,
  reconnects: 0,
  failures: 0
}

const report = (up: boolean): LiveReport => ({
  from: '2026-10-22T20:00:00Z',
  to: '2026-10-29T20:00:00Z',
  bucket_minutes: 60,
  server: [
    {
      at: '2026-10-29T20:00:00Z',
      up,
      mbps_in: 6,
      mbps_out: 24,
      loss_in_pct: 0,
      loss_out_pct: 0.5,
      rtt_ms: 30,
      livekit_cpu_pct: 20,
      host_cpu_pct: 35,
      host_mem_pct: 60,
      participants: 5,
      video_tracks_out: 4
    }
  ],
  lives: [
    {
      ...base,
      duration_seconds: 1800,
      viewers: 3,
      viewer_freezes_per_min: 0.4,
      viewer_software_ratio: 0.33
    }
  ],
  worst: [
    {
      ...base,
      id: 'w1',
      kind: 'assiste',
      username: 'bia',
      duration_seconds: 600,
      freezes_per_min: 2,
      score: 80,
      reasons: ['Decodificando no processador']
    },
    {
      ...base,
      id: 'w2',
      kind: 'call',
      username: 'caio',
      duration_seconds: 900,
      freezes_per_min: 0,
      score: 130,
      concealed_pct: 6,
      recv_loss_pct: 0.2,
      failures: 1,
      target: 'android',
      device: 'motorola moto g54',
      network: 'cellular-5g',
      reasons: ['Voz não conectou']
    }
  ],
  breakdown: {
    os: [
      { key: 'Windows', sessions: 2, below_ratio: 0.25, freezes_per_min: 0.4, software_ratio: 0 }
    ],
    gpu: [],
    codec: [],
    transport: [],
    target: [
      { key: 'android', sessions: 1, below_ratio: null, freezes_per_min: null, software_ratio: null }
    ],
    network: [],
    device: []
  },
  events: [
    {
      at: '2026-10-29T20:10:00Z',
      type: 'degrau_caiu',
      detail: '0 → 1 (cpu)',
      kind: 'transmite',
      username: 'ana'
    }
  ]
})

const render = (Tab: React.ComponentType<{ days: number }>, state: ReportState): string =>
  renderToStaticMarkup(
    <LiveReportContext.Provider value={{ days: 7, state, reload: () => {}, request: () => {} }}>
      <Tab days={7} />
    </LiveReportContext.Provider>
  )
const ready = (up = true): ReportState => ({ status: 'ready', report: report(up) })

describe('abas do relatório das lives', () => {
  it('Lives: lives recentes e só as piores sessões de live', () => {
    const html = render(LivesTab, ready())
    for (const text of ['Lives recentes', 'ana', 'CPU 40%', 'Piores lives e por quê', 'bia']) {
      expect(html).toContain(text)
    }
    expect(html).toContain('Decodificando no processador')
    expect(html).not.toContain('caio')
    expect(html).not.toContain('Pico de saída')
  })
  it('Chamadas: só as piores sessões de voz', () => {
    const html = render(CallsTab, ready())
    expect(html).toContain('Piores chamadas e por quê')
    expect(html).toContain('caio')
    expect(html).toContain('Áudio sintetizado 6% · perda recebida 0,2% · 1 falha')
    expect(html).toContain('App Android · motorola moto g54 · cellular-5g')
    expect(html).not.toContain('bia')
    expect(html).not.toContain('Lives recentes')
  })
  it('cada aba lê a sua lista do backend', () => {
    const r = report(true)
    const [live, call] = r.worst
    const both: ReportState = {
      status: 'ready',
      report: {
        ...r,
        worst: [],
        worst_lives: [{ ...live, username: 'lia' }],
        worst_calls: [{ ...call, username: 'davi', bad_minutes: 48 }]
      }
    }
    const calls = render(CallsTab, both)
    expect(calls).toContain('davi')
    expect(calls).toContain('48 min de voz ruim')
    expect(calls).not.toContain('lia')
    const lives = render(LivesTab, both)
    expect(lives).toContain('lia')
    expect(lives).not.toContain('davi')
  })
  it('Chamadas sem sessão ruim', () => {
    const empty: ReportState = { status: 'ready', report: { ...report(true), worst: [] } }
    expect(render(CallsTab, empty)).toContain('Nenhuma chamada ruim no período.')
    expect(render(LivesTab, empty)).toContain('Nenhuma live ruim no período.')
  })
  it('Servidor: picos e o aviso quando o LiveKit não mandou métricas', () => {
    const html = render(ServerTab, ready())
    expect(html).toContain('Pico de saída')
    expect(html).toContain('24 Mbps')
    expect(html).not.toContain('não mandou métricas')
    expect(render(ServerTab, ready(false))).toContain('não mandou métricas')
  })
  it('Servidor: buracos na coleta e reinícios do LiveKit', () => {
    const r = report(true)
    const withGaps: ReportState = {
      status: 'ready',
      report: {
        ...r,
        collection_gaps: [{ from: '2026-11-23T01:55:00', to: '2026-11-23T10:16:00', minutes: 501 }],
        livekit_restarts: [{ at: '2026-11-24T21:17:00', seen_at: '2026-11-24T21:18:00' }]
      }
    }
    const html = render(ServerTab, withGaps)
    expect(html).toContain('Sem coleta e reinícios do LiveKit')
    expect(html).toContain('23/11, 01:55 → 10:16 · 8 h 21 min')
    expect(html).toContain('LiveKit reiniciou')
    expect(html).toContain('24/11, 21:17')
    const clean: ReportState = {
      status: 'ready',
      report: { ...r, collection_gaps: [], livekit_restarts: [] }
    }
    expect(render(ServerTab, clean)).toContain(
      'Nenhum buraco na coleta e nenhum reinício do LiveKit no período.'
    )
    // Backend de antes: sem os campos, a seção não aparece.
    expect(render(ServerTab, ready())).not.toContain('Sem coleta')
  })
  it('Distribuição e Eventos', () => {
    const breakdown = render(BreakdownTab, ready())
    for (const text of ['Distribuição', 'Plataforma (com as calls)', 'android', 'Rede (com as calls)', 'Aparelho Android (com as calls)']) {
      expect(breakdown).toContain(text)
    }
    const events = render(EventsTab, ready())
    expect(events).toContain('Qualidade caiu')
    expect(events).toContain('0 → 1 (cpu)')
  })
  it('Eventos: as quedas e falhas da voz do período inteiro, à parte', () => {
    const r = report(true)
    const withCalls: ReportState = {
      status: 'ready',
      report: {
        ...r,
        call_events: [
          {
            at: '2026-10-23T10:00:00Z',
            type: 'reconectou',
            detail: '16 s',
            kind: 'call',
            username: 'caio'
          }
        ]
      }
    }
    const html = render(EventsTab, withCalls)
    expect(html).toContain('Quedas e falhas da voz (período inteiro)')
    expect(html).toContain('Voz reconectou')
    expect(html).toContain('16 s')
    expect(html).toContain('Eventos recentes')
    const none: ReportState = { status: 'ready', report: { ...r, call_events: [] } }
    expect(render(EventsTab, none)).toContain('Nenhuma queda ou falha de voz no período.')
    // Backend de antes, sem o campo: o painel não aparece.
    expect(render(EventsTab, ready())).not.toContain('Quedas e falhas da voz')
  })
  it('relatório de outro período: carregando, não os dados antigos', () => {
    const html = renderToStaticMarkup(
      <LiveReportContext.Provider
        value={{ days: 7, state: ready(), reload: () => {}, request: () => {} }}
      >
        <LivesTab days={1} />
      </LiveReportContext.Provider>
    )
    expect(html).toContain('Carregando')
    expect(html).not.toContain('Lives recentes')
  })
  it('estados: carregando, sem permissão e erro (em qualquer aba)', () => {
    for (const Tab of [LivesTab, CallsTab, ServerTab, BreakdownTab, EventsTab]) {
      expect(render(Tab, { status: 'loading' })).toContain('Carregando')
      expect(render(Tab, { status: 'forbidden' })).toContain(
        'Só os devs do Salinha veem esta página.'
      )
      expect(render(Tab, { status: 'error' })).toContain('Tentar de novo')
    }
  })
})
