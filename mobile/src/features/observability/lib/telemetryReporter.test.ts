import type { ScreenStatsInput } from '../../call/lib/callStatsSource'
import { createTelemetryReporter, type CallExtras, type CallSnapshot, type ReporterDeps } from './telemetryReporter'
import { statsReport as report } from './testReport'
import type { TelemetryReport } from './telemetryTypes'

const sending = (t: number): ScreenStatsInput => ({
  streamState: 'active',
  requestedFps: 15,
  report: report({
    c: { type: 'codec', mimeType: 'video/VP8' },
    o: { type: 'outbound-rtp', kind: 'video', codecId: 'c', timestamp: t, bytesSent: t * 100, powerEfficientEncoder: true }
  })
})

const receiving = (t: number): ScreenStatsInput => ({
  streamState: 'active',
  requestedFps: null,
  report: report({
    c: { type: 'codec', mimeType: 'video/H264' },
    i: { type: 'inbound-rtp', kind: 'video', codecId: 'c', timestamp: t, bytesReceived: t * 50, powerEfficientDecoder: true }
  })
})

const NOTHING: CallExtras = { connectMs: null, events: [] }

function setup(initial: CallSnapshot) {
  let snap = initial
  let clock = 0
  let ids = 0
  let extras: CallExtras = NOTHING
  const sent: TelemetryReport[][] = []
  const deps: ReporterDeps = {
    snapshot: () => snap,
    readScreen: async (_userId, local) => (local ? sending(clock) : receiving(clock)),
    readCall: async () => report({ r: { type: 'remote-inbound-rtp', timestamp: clock, fractionLost: 0 } }),
    context: async () => ({ os: 'Android 14', app_version: '0.1.0', target: 'android', gpu: '', network: 'wifi', cores: 0, device: 'samsung SM-A515F' }),
    send: jest.fn(async (reports: TelemetryReport[]) => {
      sent.push(reports)
    }),
    newId: () => `id-${++ids}`,
    callExtras: jest.fn(async () => {
      const out = extras
      extras = NOTHING
      return out
    })
  }
  const reporter = createTelemetryReporter(deps)
  const tick = async (): Promise<void> => {
    clock += 20_000
    await reporter.tick()
  }
  return { reporter, tick, sent, deps, set: (next: CallSnapshot) => (snap = next), pending: (next: CallExtras) => (extras = next) }
}

const kinds = (reports: TelemetryReport[]): string[] => reports.map((r) => r.kind).sort()
const IDLE: CallSnapshot = { callId: null, sharing: false, watching: [] }

describe('createTelemetryReporter (Android)', () => {
  it('fora de call e sem nada pendente, não manda nada', async () => {
    const t = setup(IDLE)
    await t.tick()
    expect(t.deps.send).not.toHaveBeenCalled()
  })

  it('call + minha tela + uma assistida: uma sessão de cada, num pedido só, com o contexto do aparelho', async () => {
    const t = setup({ callId: 'c1', sharing: true, watching: ['bia'] })
    await t.tick()
    expect(t.sent).toHaveLength(1)
    expect(kinds(t.sent[0])).toEqual(['assiste', 'call', 'transmite'])
    const watch = t.sent[0].find((r) => r.kind === 'assiste')!
    expect(watch).toMatchObject({ call_id: 'c1', streamer_id: 'bia', ended: false })
    expect(watch.context).toMatchObject({ target: 'android', device: 'samsung SM-A515F' })
  })

  it('a voz sai a cada 3 leituras; a live, em todas; mesma sessão = mesmo id e diferenças', async () => {
    const t = setup({ callId: 'c1', sharing: true, watching: [] })
    for (let i = 0; i < 4; i++) await t.tick()
    expect(t.sent.flat().filter((r) => r.kind === 'call' && r.sample)).toHaveLength(2)
    const shares = t.sent.flat().filter((r) => r.kind === 'transmite')
    expect(shares).toHaveLength(4)
    expect(shares[0].session_id).toBe(shares[1].session_id)
    expect(shares[1].sample).toMatchObject({ seconds: 20, bitrate_kbps: 800 })
  })

  it('a conexão e os sinais do celular vão na próxima amostra da voz', async () => {
    const t = setup({ callId: 'c1', sharing: false, watching: [] })
    t.pending({ connectMs: 1850, events: [{ type: 'rota_do_audio', detail: 'speaker' }] })
    await t.tick()
    const call = t.sent[0][0]
    expect(call.sample?.connect_ms).toBe(1850)
    expect(call.events).toEqual([{ type: 'rota_do_audio', detail: 'speaker' }])
    await t.tick()
    expect(t.deps.callExtras).toHaveBeenCalledTimes(1)
  })

  it('saiu da call: o fim de cada sessão, e os eventos da voz vão com o fim', async () => {
    const t = setup({ callId: 'c1', sharing: true, watching: ['bia'] })
    await t.tick()
    t.set(IDLE)
    t.pending({ connectMs: null, events: [{ type: 'conexao_falhou', detail: 'conectada: caiu' }] })
    await t.tick()
    expect(kinds(t.sent[1])).toEqual(['assiste', 'call', 'transmite'])
    expect(t.sent[1].every((r) => r.ended && r.sample === null)).toBe(true)
    expect(t.sent[1].find((r) => r.kind === 'call')!.events.map((e) => e.type)).toEqual(['conexao_falhou'])
  })

  it('a entrada falhou antes de existir sessão: manda uma sessão de voz só com os eventos', async () => {
    const t = setup(IDLE)
    t.pending({ connectMs: null, events: [{ type: 'conexao_falhou', detail: 'entrando (voz): x' }] })
    await t.tick()
    expect(t.sent[0]).toEqual([
      expect.objectContaining({ kind: 'call', call_id: '', sample: null, ended: true, events: [{ type: 'conexao_falhou', detail: 'entrando (voz): x' }] })
    ])
  })

  it('outra call: as sessões antigas terminam e nascem novas', async () => {
    const t = setup({ callId: 'c1', sharing: false, watching: [] })
    await t.tick()
    t.set({ callId: 'c2', sharing: false, watching: [] })
    await t.tick()
    expect(t.sent[1].map((r) => [r.call_id, r.ended])).toEqual([
      ['c1', true],
      ['c2', false]
    ])
  })

  it('tela ainda sem estatística: a sessão espera, sem amostra', async () => {
    const t = setup({ callId: 'c1', sharing: true, watching: [] })
    t.deps.readScreen = async () => null
    await t.tick()
    expect(t.sent[0].map((r) => r.kind)).toEqual(['call'])
  })

  it('falha no envio não derruba nada', async () => {
    const t = setup({ callId: 'c1', sharing: false, watching: [] })
    t.deps.send = jest.fn().mockRejectedValue(new Error('429'))
    await expect(t.tick()).resolves.toBeUndefined()
  })

  it('leitura pedida no meio de outra roda logo depois (a última, ao sair, não se perde)', async () => {
    const t = setup({ callId: 'c1', sharing: true, watching: [] })
    let release!: () => void
    t.deps.readScreen = () => new Promise((resolve) => (release = () => resolve(sending(40_000))))
    const slow = t.reporter.tick()
    t.set(IDLE)
    const last = t.reporter.tick()
    await new Promise((r) => setImmediate(r))
    release()
    await Promise.all([slow, last])
    expect(t.sent).toHaveLength(2)
    expect(t.sent[1].every((r) => r.ended)).toBe(true)
  })

  it('mais de 8 sessões: divide em pedidos', async () => {
    const watching = Array.from({ length: 9 }, (_, i) => `u${i}`)
    const t = setup({ callId: 'c1', sharing: false, watching })
    await t.tick()
    expect(t.sent.map((batch) => batch.length)).toEqual([8, 2])
  })
})
