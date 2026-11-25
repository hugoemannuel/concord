import { describe, expect, it } from 'vitest'
import { callSample } from './telemetryCall'

const report = (stats: Record<string, Record<string, unknown>>): RTCStatsReport =>
  new Map(Object.entries(stats).map(([id, s]) => [id, { id, ...s }])) as unknown as RTCStatsReport

describe('callSample', () => {
  it('voz: RTT, perda e jitter vistos pelo servidor e o transporte', () => {
    const r = report({
      t1: { type: 'transport', selectedCandidatePairId: 'p1' },
      p1: { type: 'candidate-pair', localCandidateId: 'l1', currentRoundTripTime: 0.08 },
      l1: { type: 'local-candidate', protocol: 'udp', candidateType: 'relay' },
      r1: {
        type: 'remote-inbound-rtp',
        kind: 'audio',
        fractionLost: 0.05,
        jitter: 0.02,
        timestamp: 5000
      }
    })
    expect(callSample(r, null).sample).toMatchObject({
      transport: 'relay',
      rtt_ms: 80,
      loss_pct: null,
      jitter_ms: 20,
      codec: '',
      seconds: 0
    })
  })

  it('sem relatório: amostra vazia com o intervalo', () => {
    const first = callSample(report({}), null)
    expect(first.sample).toMatchObject({ transport: '', rtt_ms: null, loss_pct: null })
  })

  it('o que eu ouço: áudio sintetizado (sem o silêncio) somando as vozes; perda, a menor', () => {
    const at = (t: number, a: Record<string, number>, b: Record<string, number>): RTCStatsReport =>
      report({
        r1: { type: 'remote-inbound-rtp', kind: 'audio', timestamp: t },
        a: { type: 'inbound-rtp', kind: 'audio', timestamp: t, ...a },
        b: { type: 'inbound-rtp', kind: 'audio', timestamp: t, ...b },
        v: { type: 'inbound-rtp', kind: 'video', concealedSamples: 999, packetsLost: 999 }
      })
    const first = callSample(
      at(
        5000,
        { concealedSamples: 1000, silentConcealedSamples: 0, totalSamplesReceived: 48_000 },
        { totalSamplesReceived: 0 }
      ),
      null
    )
    expect(first.sample).toMatchObject({ concealed_pct: null, recv_loss_pct: null })
    const next = callSample(
      at(
        65_000,
        {
          concealedSamples: 30_000,
          silentConcealedSamples: 1000,
          totalSamplesReceived: 1_008_000,
          packetsLost: 20,
          packetsReceived: 980
        },
        { totalSamplesReceived: 960_000, packetsReceived: 1000 }
      ),
      first.counters
    )
    expect(next.sample).toMatchObject({ seconds: 60, concealed_pct: 1.46, recv_loss_pct: 0 })
  })

  const voices = (t: number, byId: Record<string, Record<string, number>>): RTCStatsReport =>
    report(
      Object.fromEntries(
        Object.entries(byId).map(([id, v]) => [id, { type: 'inbound-rtp', kind: 'audio', timestamp: t, ...v }])
      )
    )

  it('perda recebida: a menor entre as vozes com tráfego (a subida ruim de quem fala não é a minha rede)', () => {
    const first = callSample(
      voices(1, {
        a: { packetsLost: 0, packetsReceived: 0 },
        b: { packetsLost: 0, packetsReceived: 0 },
        c: { packetsLost: 0, packetsReceived: 0 }
      }),
      null
    )
    const next = callSample(
      voices(60_000, {
        a: { packetsLost: 100, packetsReceived: 900 },
        b: { packetsLost: 10, packetsReceived: 990 },
        c: { packetsLost: 0, packetsReceived: 50 }
      }),
      first.counters
    )
    expect(next.sample.recv_loss_pct).toBe(1)
    const quiet = callSample(
      voices(120_000, { a: { packetsLost: 100, packetsReceived: 950 } }),
      next.counters
    )
    expect(quiet.sample.recv_loss_pct).toBeNull()
  })

  it('voz que sai ou entra no intervalo não zera nem infla o áudio sintetizado', () => {
    const first = callSample(
      voices(1, {
        a: { concealedSamples: 0, totalSamplesReceived: 48_000 },
        b: { concealedSamples: 5000, totalSamplesReceived: 1_000_000 }
      }),
      null
    )
    const next = callSample(
      voices(60_000, {
        a: { concealedSamples: 9600, totalSamplesReceived: 1_008_000 },
        n: { concealedSamples: 40_000, totalSamplesReceived: 50_000 }
      }),
      first.counters
    )
    expect(next.sample.concealed_pct).toBe(1)
  })

  it('só ouvindo (sem o meu microfone): o intervalo vem da voz recebida', () => {
    const at = (t: number): RTCStatsReport =>
      report({ a: { type: 'inbound-rtp', kind: 'audio', timestamp: t, totalSamplesReceived: t } })
    const first = callSample(at(1000), null)
    expect(callSample(at(61_000), first.counters).sample.seconds).toBe(60)
  })

  it('o intervalo é o da leitura, não o do último relatório do servidor', () => {
    const at = (readAt: number, rtcpAt: number): RTCStatsReport =>
      report({
        t1: { type: 'transport', timestamp: readAt },
        r1: { type: 'remote-inbound-rtp', kind: 'audio', timestamp: rtcpAt }
      })
    const first = callSample(at(20_000, 5000), null)
    expect(callSample(at(80_000, 25_000), first.counters).sample.seconds).toBe(60)
  })

  it('perda na subida: a média do intervalo, não o último fractionLost', () => {
    const at = (t: number, lost: number, received: number): RTCStatsReport =>
      report({
        r1: {
          type: 'remote-inbound-rtp',
          kind: 'audio',
          timestamp: t,
          fractionLost: 0.9,
          packetsLost: lost,
          packetsReceived: received
        }
      })
    const first = callSample(at(1, 10, 1000), null)
    expect(callSample(at(60_000, 40, 3970), first.counters).sample.loss_pct).toBe(1)
  })

  it('perda na subida sem packetsReceived: sobre os pacotes que mandei; mudo = sem perda', () => {
    const at = (t: number, lost: number, sent: number): RTCStatsReport =>
      report({
        o1: { type: 'outbound-rtp', kind: 'audio', timestamp: t, packetsSent: sent },
        r1: { type: 'remote-inbound-rtp', kind: 'audio', localId: 'o1', timestamp: t, packetsLost: lost }
      })
    const first = callSample(at(1, 10, 1000), null)
    const next = callSample(at(60_000, 70, 4000), first.counters)
    expect(next.sample.loss_pct).toBe(2)
    expect(callSample(at(120_000, 70, 4000), next.counters).sample.loss_pct).toBeNull()
  })

  it('leitura anterior vazia: esta é a base, sem perda acumulada nem intervalo inflado', () => {
    const empty = callSample(report({}), null)
    const r = report({
      r1: { type: 'remote-inbound-rtp', kind: 'audio', timestamp: 600_000, packetsLost: 500, packetsReceived: 500 }
    })
    expect(callSample(r, empty.counters).sample).toMatchObject({ seconds: 0, loss_pct: null })
  })
})
