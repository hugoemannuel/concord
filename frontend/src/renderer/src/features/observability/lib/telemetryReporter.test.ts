import { describe, expect, it, vi } from 'vitest'
import type { ScreenStatsInput } from '../../call/lib/screenStats'
import {
  createTelemetryReporter,
  stepChanged,
  type CallSnapshot,
  type ReporterDeps
} from './telemetryReporter'
import type { ConnectionSource, ConnectionTelemetry } from './telemetryConnection'
import type { TelemetryEvent, TelemetryReport } from './telemetryTypes'

/** Conexão de mentira: devolve o pendente e limpa, como o createConnectionLog. */
function fakeConnection(initial: ConnectionTelemetry): ConnectionSource & {
  pending: ConnectionTelemetry
} {
  const source = {
    pending: initial,
    take(): ConnectionTelemetry {
      const out = source.pending
      source.pending = { connectMs: null, events: [] }
      return out
    },
    takeEvents(): TelemetryEvent[] {
      const { events } = source.pending
      source.pending = { ...source.pending, events: [] }
      return events
    }
  }
  return source
}

const report = (stats: Record<string, Record<string, unknown>>): RTCStatsReport =>
  new Map(Object.entries(stats).map(([id, s]) => [id, { id, ...s }])) as unknown as RTCStatsReport

const sending = (t: number, step = 0): ScreenStatsInput => ({
  local: true,
  enabled: true,
  streamState: 'active',
  requestedFps: 30,
  quality: { chosen: '1080p 30', effective: '1080p 30', reduced: step > 0, reason: null, step },
  report: report({
    c: { type: 'codec', mimeType: 'video/H264' },
    o: {
      type: 'outbound-rtp',
      kind: 'video',
      codecId: 'c',
      timestamp: t,
      bytesSent: t * 100,
      powerEfficientEncoder: true
    }
  })
})

const receiving = (t: number): ScreenStatsInput => ({
  local: false,
  enabled: true,
  streamState: 'active',
  requestedFps: null,
  report: report({
    c: { type: 'codec', mimeType: 'video/H264' },
    i: {
      type: 'inbound-rtp',
      kind: 'video',
      codecId: 'c',
      timestamp: t,
      bytesReceived: t * 50,
      powerEfficientDecoder: true
    }
  })
})

function setup(initial: CallSnapshot) {
  let snap = initial
  let clock = 0
  let ids = 0
  let step = 0
  const sent: TelemetryReport[][] = []
  const deps: ReporterDeps = {
    snapshot: () => snap,
    readScreen: async (_userId, local) => (local ? sending(clock, step) : receiving(clock)),
    readCall: async () =>
      report({ r: { type: 'remote-inbound-rtp', timestamp: clock, fractionLost: 0 } }),
    context: async () => ({
      os: 'Linux',
      app_version: '1',
      target: 'desktop',
      gpu: '',
      network: '',
      cores: 4
    }),
    send: vi.fn(async (reports: TelemetryReport[]) => {
      sent.push(reports)
    }),
    newId: () => `id-${++ids}`
  }
  const reporter = createTelemetryReporter(deps)
  const tick = async (): Promise<void> => {
    clock += 20_000
    await reporter.tick()
  }
  return {
    reporter,
    tick,
    sent,
    deps,
    set: (next: CallSnapshot) => (snap = next),
    setStep: (s: number) => (step = s)
  }
}

const kinds = (reports: TelemetryReport[]): string[] => reports.map((r) => r.kind).sort()

describe('createTelemetryReporter', () => {
  it('fora de call não manda nada', async () => {
    const t = setup({ callId: null, sharing: false, watching: [] })
    await t.tick()
    expect(t.deps.send).not.toHaveBeenCalled()
  })

  it('call + minha live + uma assistida: uma sessão de cada, num pedido só', async () => {
    const t = setup({ callId: 'c1', sharing: true, watching: ['bia'] })
    await t.tick()
    expect(t.sent).toHaveLength(1)
    expect(kinds(t.sent[0])).toEqual(['assiste', 'call', 'transmite'])
    const watch = t.sent[0].find((r) => r.kind === 'assiste')!
    expect(watch).toMatchObject({ call_id: 'c1', streamer_id: 'bia', ended: false })
    expect(watch.context.cores).toBe(4)
  })

  it('a voz sai a cada 3 leituras; a live, em todas', async () => {
    const t = setup({ callId: 'c1', sharing: true, watching: [] })
    for (let i = 0; i < 4; i++) await t.tick()
    const callSamples = t.sent.flat().filter((r) => r.kind === 'call' && r.sample)
    expect(callSamples).toHaveLength(2)
    expect(t.sent.flat().filter((r) => r.kind === 'transmite')).toHaveLength(4)
  })

  it('mesma sessão entre leituras: mesmo id e diferenças no intervalo', async () => {
    const t = setup({ callId: 'c1', sharing: true, watching: [] })
    await t.tick()
    await t.tick()
    const shares = t.sent.flat().filter((r) => r.kind === 'transmite')
    expect(shares[0].session_id).toBe(shares[1].session_id)
    expect(shares[1].sample).toMatchObject({ seconds: 20, bitrate_kbps: 800 })
  })

  it('parou de transmitir e de assistir: manda o fim de cada', async () => {
    const t = setup({ callId: 'c1', sharing: true, watching: ['bia'] })
    await t.tick()
    t.set({ callId: 'c1', sharing: false, watching: [] })
    await t.tick()
    const ended = t.sent[1].filter((r) => r.ended)
    expect(kinds(ended)).toEqual(['assiste', 'transmite'])
    expect(ended.every((r) => r.sample === null)).toBe(true)
  })

  it('outra call: as sessões antigas terminam e nascem novas', async () => {
    const t = setup({ callId: 'c1', sharing: false, watching: [] })
    await t.tick()
    const first = t.sent[0][0].session_id
    t.set({ callId: 'c2', sharing: false, watching: [] })
    await t.tick()
    expect(t.sent[1].map((r) => [r.call_id, r.ended])).toEqual([
      ['c1', true],
      ['c2', false]
    ])
    expect(t.sent[1][1].session_id).not.toBe(first)
  })

  it('conta as trocas de degrau e gera o evento quando cai', async () => {
    const t = setup({ callId: 'c1', sharing: true, watching: [] })
    await t.tick()
    t.reporter.noteStepChange()
    t.reporter.noteStepChange()
    t.setStep(1)
    await t.tick()
    const share = t.sent[1].find((r) => r.kind === 'transmite')!
    expect(share.sample?.step_changes).toBe(2)
    expect(share.events.map((e) => e.type)).toContain('degrau_caiu')
    await t.tick()
    expect(t.sent[2].find((r) => r.kind === 'transmite')!.sample?.step_changes).toBe(0)
  })

  it('live ainda sem estatística: a sessão espera, sem amostra', async () => {
    const t = setup({ callId: 'c1', sharing: true, watching: [] })
    t.deps.readScreen = async () => null
    await t.tick()
    expect(t.sent[0].map((r) => r.kind)).toEqual(['call'])
  })

  it('falha no envio não derruba nada; leitura em andamento não sobrepõe', async () => {
    const t = setup({ callId: 'c1', sharing: true, watching: [] })
    t.deps.send = vi.fn(async () => {
      throw new Error('429')
    })
    await expect(t.tick()).resolves.toBeUndefined()
    let release!: () => void
    t.deps.readScreen = () => new Promise((resolve) => (release = () => resolve(sending(40_000))))
    const slow = t.reporter.tick()
    await t.reporter.tick()
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    release()
    await slow
    expect(t.deps.send).toHaveBeenCalledTimes(2)
  })

  it('envio falhou: evento e fim voltam no próximo ciclo, sem a amostra', async () => {
    const t = setup({ callId: 'c1', sharing: false, watching: [] })
    const connection = fakeConnection({ connectMs: null, events: [] })
    t.deps.connection = connection
    await t.tick()
    const send = t.deps.send
    t.deps.send = vi.fn(async () => {
      throw new Error('servidor fora')
    })
    connection.pending = { connectMs: null, events: [{ type: 'conexao_falhou', detail: 'x', at: 0 }] }
    t.set({ callId: null, sharing: false, watching: [] })
    await t.tick()
    t.deps.send = send
    await t.tick()
    const retried = t.sent[1]
    expect(retried).toHaveLength(1)
    expect(retried[0]).toMatchObject({ kind: 'call', ended: true, sample: null })
    expect(retried[0].events.map((e) => e.type)).toEqual(['conexao_falhou'])
  })

  it('cada evento diz há quanto tempo aconteceu', async () => {
    const t = setup({ callId: 'c1', sharing: false, watching: [] })
    let now = 100_000
    t.deps.now = () => now
    const connection = fakeConnection({ connectMs: null, events: [] })
    t.deps.connection = connection
    await t.tick()
    connection.pending = { connectMs: null, events: [{ type: 'reconectou', detail: '3 s', at: 70_000 }] }
    t.set({ callId: null, sharing: false, watching: [] })
    now = 130_000
    await t.tick()
    expect(t.sent[1][0]).toMatchObject({ ago_ms: 0, events: [{ ago_ms: 60_000 }] })
  })

  it('mais de 8 sessões: divide em pedidos', async () => {
    const watching = Array.from({ length: 9 }, (_, i) => `u${i}`)
    const t = setup({ callId: 'c1', sharing: false, watching })
    await t.tick()
    expect(t.sent.map((batch) => batch.length)).toEqual([8, 2])
  })
})

describe('createTelemetryReporter: conexão e codec', () => {
  it('a conexão vai na próxima amostra da voz: tempo para conectar e eventos', async () => {
    const t = setup({ callId: 'c1', sharing: false, watching: [] })
    const connection = fakeConnection({ connectMs: null, events: [] })
    t.deps.connection = connection
    await t.tick()
    connection.pending = { connectMs: 1850, events: [{ type: 'reconectou', detail: '3 s' }] }
    await t.tick()
    await t.tick()
    expect(t.sent.flat()).toHaveLength(1)
    await t.tick()
    const call = t.sent.flat()[1]
    expect(call.sample?.connect_ms).toBe(1850)
    expect(call.events).toMatchObject([{ type: 'reconectou', detail: '3 s' }])
  })

  it('saiu da call: os eventos de conexão vão com o fim', async () => {
    const t = setup({ callId: 'c1', sharing: false, watching: [] })
    await t.tick()
    t.deps.connection = fakeConnection({
      connectMs: null,
      events: [{ type: 'conexao_falhou', detail: 'entrando (mídia): x' }]
    })
    t.set({ callId: null, sharing: false, watching: [] })
    await t.tick()
    expect(t.sent[1][0]).toMatchObject({ ended: true, kind: 'call' })
    expect(t.sent[1][0].events.map((e) => e.type)).toEqual(['conexao_falhou'])
  })

  it('trocou de call: a sessão que termina leva os eventos e a nova, o tempo para entrar', async () => {
    const t = setup({ callId: 'c1', sharing: false, watching: [] })
    const connection = fakeConnection({ connectMs: null, events: [] })
    t.deps.connection = connection
    await t.tick()
    connection.pending = {
      connectMs: 900,
      events: [{ type: 'conexao_falhou', detail: 'reconectando: x' }]
    }
    t.set({ callId: 'c2', sharing: false, watching: [] })
    await t.tick()
    const [ended, fresh] = t.sent[1]
    expect(ended).toMatchObject({ call_id: 'c1', ended: true })
    expect(ended.events.map((e) => e.type)).toEqual(['conexao_falhou'])
    expect(fresh).toMatchObject({ call_id: 'c2', ended: false })
    expect(fresh.sample?.connect_ms).toBe(900)
  })

  it('a live leva o motivo do codec na amostra seguinte à escolha', async () => {
    const t = setup({ callId: 'c1', sharing: true, watching: [] })
    let choice: string | null = 'auto: h265 + h264'
    t.deps.codecChoice = () => {
      const out = choice
      choice = null
      return out
    }
    await t.tick()
    await t.tick()
    const shares = t.sent.flat().filter((r) => r.kind === 'transmite')
    expect(shares[0].events).toContainEqual({
      type: 'codec_escolhido',
      detail: 'auto: h265 + h264',
      ago_ms: expect.any(Number)
    })
    expect(shares[1].events.map((e) => e.type)).not.toContain('codec_escolhido')
  })
})

describe('stepChanged', () => {
  it('só a troca de degrau com a live no ar', () => {
    expect(stepChanged({ step: 0 }, { step: 1 })).toBe(true)
    expect(stepChanged({ step: 1 }, { step: 1 })).toBe(false)
    expect(stepChanged(null, { step: 0 })).toBe(false)
    expect(stepChanged({ step: 2 }, null)).toBe(false)
  })
})
