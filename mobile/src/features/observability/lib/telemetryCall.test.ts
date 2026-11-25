import { callSample } from './telemetryCall'
import { statsReport as report } from './testReport'

describe('callSample', () => {
  it('voz: RTT, perda e jitter vistos pelo servidor e o transporte', () => {
    const r = report({
      t1: { type: 'transport', selectedCandidatePairId: 'p1' },
      p1: { type: 'candidate-pair', localCandidateId: 'l1', currentRoundTripTime: 0.08 },
      l1: { type: 'local-candidate', protocol: 'udp', candidateType: 'relay' },
      r1: { type: 'remote-inbound-rtp', kind: 'audio', fractionLost: 0.05, jitter: 0.02, timestamp: 5000 }
    })
    expect(callSample(r, null).sample).toMatchObject({ transport: 'relay', rtt_ms: 80, loss_pct: 5, jitter_ms: 20, codec: '', seconds: 0 })
  })

  it('sem relatório: amostra vazia', () => {
    expect(callSample(report({}), null).sample).toMatchObject({ transport: '', rtt_ms: null, loss_pct: null })
  })

  it('o que eu ouço: áudio sintetizado (sem o silêncio) e perda, somando as vozes', () => {
    const at = (t: number, a: Record<string, number>, b: Record<string, number>) =>
      report({
        r1: { type: 'remote-inbound-rtp', kind: 'audio', timestamp: t },
        a: { type: 'inbound-rtp', kind: 'audio', timestamp: t, ...a },
        b: { type: 'inbound-rtp', kind: 'audio', timestamp: t, ...b },
        v: { type: 'inbound-rtp', kind: 'video', concealedSamples: 999, packetsLost: 999 }
      })
    const first = callSample(at(5000, { concealedSamples: 1000, silentConcealedSamples: 0, totalSamplesReceived: 48_000 }, { totalSamplesReceived: 0 }), null)
    expect(first.sample).toMatchObject({ concealed_pct: null, recv_loss_pct: null })
    const next = callSample(
      at(
        65_000,
        { concealedSamples: 30_000, silentConcealedSamples: 1000, totalSamplesReceived: 1_008_000, packetsLost: 20, packetsReceived: 980 },
        { totalSamplesReceived: 960_000, packetsReceived: 1000 }
      ),
      first.counters
    )
    expect(next.sample).toMatchObject({ seconds: 60, concealed_pct: 1.46, recv_loss_pct: 1 })
  })

  it('só ouvindo (sem o meu microfone): o intervalo vem da voz recebida', () => {
    const at = (t: number) => report({ a: { type: 'inbound-rtp', kind: 'audio', timestamp: t, totalSamplesReceived: t } })
    const first = callSample(at(1000), null)
    expect(callSample(at(61_000), first.counters).sample.seconds).toBe(60)
  })
})
