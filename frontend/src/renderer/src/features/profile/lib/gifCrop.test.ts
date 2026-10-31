import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cropGif, MAX_GIF_FRAMES, type SourceFrame } from './gifCrop'
import { decodeGif } from './gifTestDecoder'

const rect = { sx: 1, sy: 2, sw: 3, sh: 4 }
const out = { width: 2, height: 2 }

async function* source(...delays: number[]): AsyncGenerator<SourceFrame> {
  for (const [i, durationMs] of delays.entries()) {
    yield { image: { id: i } as unknown as CanvasImageSource, durationMs }
  }
}

/** "Desenha" um quadro de uma cor só, conforme o número do quadro. */
const draw = (image: CanvasImageSource): Uint8ClampedArray => {
  const id = (image as unknown as { id: number }).id
  const pixel = [id === 0 ? 255 : 0, 0, id === 0 ? 0 : 255, 255]
  return Uint8ClampedArray.from(Array.from({ length: 4 }, () => pixel).flat())
}

describe('cropGif', () => {
  it('moldura: o pixel transparente continua transparente em todos os quadros', async () => {
    // Quadro 0 vermelho e quadro 1 azul, com o canto de cima à esquerda vazado.
    const ring = (image: CanvasImageSource): Uint8ClampedArray => {
      const id = (image as unknown as { id: number }).id
      const color = [id === 0 ? 255 : 0, 0, id === 0 ? 0 : 255, 255]
      return Uint8ClampedArray.from([0, 0, 0, 0, ...color, ...color, ...color])
    }
    const gif = decodeGif(await cropGif(source(50, 50), rect, out, ring))
    expect(gif.frames).toHaveLength(2)
    for (const frame of gif.frames) {
      expect(frame.rgba[3]).toBe(0)
      expect(frame.rgba[7]).toBe(255)
    }
  })

  it('gera um GIF com todos os quadros, no tamanho de saída', async () => {
    const bytes = await cropGif(source(50, 80, 30), rect, out, draw)
    expect(String.fromCharCode(...bytes.slice(0, 6))).toBe('GIF89a')
    expect([bytes[6], bytes[8]]).toEqual([2, 2])
    const controls = bytes.reduce((n, b, i) => n + (b === 0x21 && bytes[i + 1] === 0xf9 ? 1 : 0), 0)
    expect(controls).toBe(3)
  })

  it('repassa o retângulo de origem e a saída para o desenho', async () => {
    const seen: unknown[] = []
    await cropGif(source(10), rect, out, (img, r, o) => {
      seen.push(r, o)
      return draw(img)
    })
    expect(seen).toEqual([rect, out])
  })

  it('recusa GIF com quadros demais', async () => {
    await expect(
      cropGif(source(...Array(MAX_GIF_FRAMES + 1).fill(20)), rect, out, draw)
    ).rejects.toThrow(/quadros/)
  })

  it('recusa GIF sem quadros', async () => {
    await expect(cropGif(source(), rect, out, draw)).rejects.toThrow()
  })

  it('GIF real gravado por retângulos não infla ao ser reescrito (regressão)', async () => {
    // 64×64, 48 quadros: fundo parado e um quadrado andando (ffmpeg, diff_mode=rectangle)
    const original = readFileSync(join(__dirname, 'fixtures', 'quadrado-andando.gif'))
    const gif = decodeGif(new Uint8Array(original))
    async function* frames(): AsyncGenerator<SourceFrame> {
      for (const [i, f] of gif.frames.entries()) {
        yield { image: i as unknown as CanvasImageSource, durationMs: f.delay }
      }
    }
    const size = { width: gif.width, height: gif.height }
    const whole = { sx: 0, sy: 0, sw: gif.width, sh: gif.height }
    const bytes = await cropGif(frames(), whole, size, (i) => gif.frames[i as unknown as number].rgba)
    // antes: cada quadro inteiro, 12× o original
    expect(bytes.length).toBeLessThan(original.length * 1.25)
    const again = decodeGif(bytes)
    expect(again.frames.map((f) => f.delay)).toEqual(gif.frames.map((f) => f.delay))
  })
})
