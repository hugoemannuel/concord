import { describe, expect, it } from 'vitest'
import { CodecGuard, sentCodec } from './screenCodecGuard'

/** getStats() do envio principal saindo nesse codec. */
const sending = (mimeType: string, extra: Record<string, unknown> = {}): RTCStatsReport =>
  new Map<string, Record<string, unknown>>([
    ['c1', { id: 'c1', type: 'codec', mimeType }],
    ['o1', { id: 'o1', type: 'outbound-rtp', kind: 'video', codecId: 'c1', bytesSent: 10, ...extra }]
  ]) as unknown as RTCStatsReport

describe('sentCodec', () => {
  it('o codec que está saindo de fato ("video/H265" → h265)', () => {
    expect(sentCodec(sending('video/H265'))).toBe('h265')
    expect(sentCodec(sending('video/VP8'))).toBe('vp8')
  })

  it('sem envio ativo ou sem codec: null', () => {
    expect(sentCodec(sending('video/H265', { active: false }))).toBeNull()
    expect(sentCodec(new Map() as unknown as RTCStatsReport)).toBeNull()
    expect(sentCodec(sending('video/rtx'))).toBeNull()
  })
})

describe('CodecGuard', () => {
  it('regressão: publicado H.265, saindo VP8 em duas leituras seguidas → avisa a troca', () => {
    const guard = new CodecGuard('h265')
    expect(guard.check(sending('video/VP8'))).toBeNull()
    expect(guard.check(sending('video/VP8'))).toBe('vp8')
  })

  it('uma leitura fora e depois volta ao publicado: não avisa', () => {
    const guard = new CodecGuard('h265')
    expect(guard.check(sending('video/VP8'))).toBeNull()
    expect(guard.check(sending('video/H265'))).toBeNull()
    expect(guard.check(sending('video/VP8'))).toBeNull()
  })

  it('saindo no codec publicado ou sem envio (ninguém vendo): nada', () => {
    const guard = new CodecGuard('h264')
    expect(guard.check(sending('video/H264'))).toBeNull()
    expect(guard.check(sending('video/H264', { active: false }))).toBeNull()
    expect(guard.check(sending('video/H264', { active: false }))).toBeNull()
  })
})
