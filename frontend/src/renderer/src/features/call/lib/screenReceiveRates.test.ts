import { describe, expect, it } from 'vitest'
import { receiveCounters, receiveRates, type ReceiveCounters } from './screenReceiveRates'

function report(inbound: Record<string, unknown>, mimeType = 'video/H265'): RTCStatsReport {
  return new Map<string, Record<string, unknown>>([
    ['c1', { id: 'c1', type: 'codec', mimeType }],
    ['i1', { id: 'i1', type: 'inbound-rtp', kind: 'video', codecId: 'c1', ...inbound }]
  ]) as unknown as RTCStatsReport
}

const base = {
  timestamp: 10_000,
  framesReceived: 100,
  framesDecoded: 100,
  totalDecodeTime: 0.5,
  packetsReceived: 1000,
  packetsLost: 0,
  bytesReceived: 1
}

describe('receiveCounters', () => {
  it('lê o vídeo recebido e o codec dele', () => {
    expect(receiveCounters(report(base))).toEqual({
      at: 10_000,
      codec: 'h265',
      framesReceived: 100,
      framesDecoded: 100,
      decodeSeconds: 0.5,
      packetsReceived: 1000,
      packetsLost: 0
    })
  })

  it('sem vídeo recebido: null', () => {
    expect(receiveCounters(new Map() as unknown as RTCStatsReport)).toBeNull()
  })
})

describe('receiveRates', () => {
  const at = (patch: Partial<ReceiveCounters>): ReceiveCounters => ({
    ...(receiveCounters(report(base)) as ReceiveCounters),
    ...patch
  })

  it('quadros por segundo chegando e decodificados, tempo por quadro e perda no intervalo', () => {
    const prev = at({})
    const now = at({
      at: 12_000,
      framesReceived: 160,
      framesDecoded: 120,
      decodeSeconds: 1.3,
      packetsReceived: 1990,
      packetsLost: 10
    })
    expect(receiveRates(prev, now)).toEqual({
      codec: 'h265',
      receivedFps: 30,
      decodedFps: 10,
      decodeMs: 40,
      lossRatio: 0.01
    })
  })

  it('sem quadro decodificado: tempo por quadro desconhecido', () => {
    const rates = receiveRates(at({}), at({ at: 12_000, framesReceived: 120 }))
    expect(rates).toMatchObject({ receivedFps: 10, decodedFps: 0, decodeMs: null })
  })

  it('sem leitura anterior, tempo parado, codec trocado ou contador zerado: não mede', () => {
    expect(receiveRates(null, at({}))).toBeNull()
    expect(receiveRates(at({}), at({}))).toBeNull()
    expect(receiveRates(at({}), at({ at: 12_000, codec: 'h264' }))).toBeNull()
    expect(receiveRates(at({}), at({ at: 12_000, framesReceived: 5 }))).toBeNull()
  })
})
