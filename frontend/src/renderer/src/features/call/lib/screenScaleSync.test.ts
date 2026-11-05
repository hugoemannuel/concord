import { describe, expect, it, vi } from 'vitest'
import { syncScreenScales } from './screenScaleSync'

/** Sender com o tamanho que a captura entrega de verdade (estatística media-source). */
function sender(encodings: RTCRtpEncodingParameters[], size?: { width: number; height: number }) {
  let parameters = { encodings } as RTCRtpSendParameters
  const source = size ? [{ type: 'media-source', kind: 'video', ...size }] : []
  return {
    getParameters: () => structuredClone(parameters),
    setParameters: vi.fn(async (next: RTCRtpSendParameters) => {
      parameters = next
    }),
    getStats: vi.fn(async () => new Map(source.map((stat, index) => [String(index), stat]))),
    encodings: () => parameters.encodings
  }
}

function backupTrack(size: { width: number; height: number }, scale = 2) {
  const backup = sender([{ scaleResolutionDownBy: scale, maxBitrate: 2_500_000, active: true }], size)
  const main = sender([{ maxBitrate: 10_000_000 }], size)
  const track = { sender: main, simulcastCodecs: new Map([['h264', { sender: backup }]]) }
  return { track, backup, main }
}

const sides = (width: number, height: number, scale = 1): number[] => [
  Math.trunc(width / scale) % 2,
  Math.trunc(height / scale) % 2
]

describe('syncScreenScales', () => {
  it('regressão: alt-tab (1440 → 1438) com a reserva em escala 2 sairia 1280×719, ímpar = processador', async () => {
    const { track, backup } = backupTrack({ width: 2560, height: 1438 })
    await syncScreenScales(track as never)
    expect(backup.setParameters).toHaveBeenCalledTimes(1)
    expect(sides(2560, 1438, backup.encodings()[0].scaleResolutionDownBy)).toEqual([0, 0])
    expect(backup.encodings()[0]).toMatchObject({ maxBitrate: 2_500_000, active: true })
  })

  it('regressão: o tamanho vem do que a captura entrega (getSettings do clone fica em 1440)', async () => {
    const { track, backup } = backupTrack({ width: 2560, height: 1438 })
    const stale = { getSettings: () => ({ width: 2560, height: 1440 }) }
    track.simulcastCodecs.set('h264', { sender: backup, mediaStreamTrack: stale } as never)
    await syncScreenScales(track as never)
    expect(backup.setParameters).toHaveBeenCalledTimes(1)
  })

  it('o tamanho não mudou: não chama setParameters à toa (a cada 2 s)', async () => {
    const { track, backup, main } = backupTrack({ width: 2560, height: 1440 })
    await syncScreenScales(track as never)
    expect(backup.setParameters).not.toHaveBeenCalled()
    expect(main.setParameters).not.toHaveBeenCalled()
  })

  it('a reserva ainda não existe (ninguém pediu): nada a fazer', async () => {
    const { track, backup } = backupTrack({ width: 2560, height: 1438 })
    track.simulcastCodecs.set('h264', { sender: undefined as never })
    await syncScreenScales(track as never)
    expect(backup.setParameters).not.toHaveBeenCalled()
  })

  it('sem tamanho nas estatísticas: não vira escala 1 (a reserva sairia em 1440p)', async () => {
    const backup = sender([{ scaleResolutionDownBy: 2 }])
    const track = { simulcastCodecs: new Map([['h264', { sender: backup }]]) }
    await syncScreenScales(track as never)
    expect(backup.setParameters).not.toHaveBeenCalled()
  })

  it('camada extra de 720p: refaz só a de baixo quando o tamanho muda', async () => {
    const main = sender(
      [{ scaleResolutionDownBy: 2, maxBitrate: 3_000_000 }, { maxBitrate: 10_000_000 }],
      { width: 2560, height: 1438 }
    )
    await syncScreenScales({ sender: main, simulcastCodecs: new Map() } as never)
    const [low, top] = main.encodings()
    expect(sides(2560, 1438, low.scaleResolutionDownBy)).toEqual([0, 0])
    expect(top.scaleResolutionDownBy).toBeUndefined()
  })

  it('live numa camada só: a de cima não muda de escala', async () => {
    const main = sender([{ maxBitrate: 10_000_000 }], { width: 2560, height: 1438 })
    await syncScreenScales({ sender: main, simulcastCodecs: new Map() } as never)
    expect(main.setParameters).not.toHaveBeenCalled()
  })

  it('sem sender publicado (republicando): não quebra', async () => {
    await expect(syncScreenScales({ simulcastCodecs: new Map() } as never)).resolves.toBeUndefined()
  })
})
