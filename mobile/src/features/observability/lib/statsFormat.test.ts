import { codecSubtype, onHardware, videoRtp } from './statsFormat'

describe('onHardware', () => {
  it('o WebRTC dizendo, vale o que ele diz', () => {
    expect(onHardware('libvpx', true)).toBe(true)
    expect(onHardware('c2.qti.avc.encoder', false)).toBe(false)
  })

  it('reconhece os codificadores do MediaCodec do Android', () => {
    expect(onHardware('c2.qti.avc.encoder', undefined)).toBe(true)
    expect(onHardware('OMX.Exynos.AVC.Decoder', undefined)).toBe(true)
    expect(onHardware('SimulcastEncoderAdapter (c2.exynos.vp8.encoder, c2.exynos.vp8.encoder)', undefined)).toBe(true)
    expect(onHardware('c2.android.vp8.decoder', undefined)).toBe(false)
    expect(onHardware('OMX.google.h264.decoder', undefined)).toBe(false)
    expect(onHardware('libvpx', undefined)).toBe(false)
  })

  it('nome desconhecido: não sabe', () => {
    expect(onHardware('', undefined)).toBeNull()
    expect(onHardware('Alguma coisa', undefined)).toBeNull()
  })
})

describe('codecSubtype e videoRtp', () => {
  const report = new Map<string, Record<string, unknown>>([
    ['c', { type: 'codec', mimeType: 'video/H264' }],
    ['a', { type: 'outbound-rtp', kind: 'video', codecId: 'c', bytesSent: 100 }],
    ['b', { type: 'outbound-rtp', kind: 'video', codecId: 'c', bytesSent: 900 }],
    ['p', { type: 'outbound-rtp', kind: 'video', active: false, bytesSent: 5000 }],
    ['s', { type: 'outbound-rtp', kind: 'audio', bytesSent: 9999 }]
  ])

  it('o RTP de vídeo ativo que mais trafega, com o codec', () => {
    const stat = videoRtp(report, 'outbound-rtp', 'bytesSent')
    expect(stat?.bytesSent).toBe(900)
    expect(codecSubtype(report, stat!)).toBe('H264')
  })

  it('só pausados: o pausado; sem codec: null', () => {
    const paused = new Map([['p', { type: 'inbound-rtp', kind: 'video', active: false }]])
    expect(videoRtp(paused, 'inbound-rtp', 'bytesReceived')).toEqual({ type: 'inbound-rtp', kind: 'video', active: false })
    expect(codecSubtype(paused, { codecId: 'x' })).toBeNull()
    expect(videoRtp(new Map(), 'inbound-rtp', 'bytesReceived')).toBeNull()
  })
})
