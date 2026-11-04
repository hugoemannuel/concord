import { describe, expect, it, vi } from 'vitest'
import { fakeCtx } from './fakeCtx'
import { quarterTurns, screenPoint, viewScene, worldSize, type EffectView } from './view'
import type { Scene } from './types'

const view = (over: Partial<EffectView> = {}): EffectView => ({
  size: 1,
  flow: 'down',
  direction: 'default',
  ...over
})

describe('quarterTurns', () => {
  it('padrão, sem sentido próprio ou o mesmo sentido: não gira', () => {
    expect(quarterTurns('down', 'default')).toBe(0)
    expect(quarterTurns(null, 'left')).toBe(0)
    expect(quarterTurns('up', 'up')).toBe(0)
  })
  it('conta os quartos de volta', () => {
    expect(quarterTurns('down', 'left')).toBe(1)
    expect(quarterTurns('down', 'up')).toBe(2)
    expect(quarterTurns('down', 'right')).toBe(3)
    expect(quarterTurns('up', 'down')).toBe(2)
    expect(quarterTurns('right', 'left')).toBe(2)
  })
})

describe('worldSize', () => {
  it('tamanho maior = mundo menor (a cena desenha ampliada)', () => {
    expect(worldSize(300, 400, view({ size: 2 }))).toEqual([150, 200])
  })
  it('de lado, largura e altura trocam', () => {
    expect(worldSize(300, 400, view({ direction: 'left' }))).toEqual([400, 300])
    expect(worldSize(300, 400, view({ direction: 'up' }))).toEqual([300, 400])
  })
})

describe('screenPoint: o que anda para baixo na cena anda no sentido pedido na tela', () => {
  const flowOf = (v: EffectView): [number, number] => {
    const [wx, wy] = worldSize(300, 400, v)
    const a = screenPoint(wx / 2, wy / 2, 300, 400, v)
    const b = screenPoint(wx / 2, wy / 2 + 10, 300, 400, v)
    return [Math.sign(Math.round(b[0] - a[0])), Math.sign(Math.round(b[1] - a[1]))]
  }
  it.each([
    ['default', [0, 1]],
    ['down', [0, 1]],
    ['up', [0, -1]],
    ['left', [-1, 0]],
    ['right', [1, 0]]
  ] as const)('%s', (direction, want) => {
    expect(flowOf(view({ direction }))).toEqual(want)
  })
  it('sentido natural para cima: pedir para baixo inverte', () => {
    const v = view({ flow: 'up', direction: 'down' })
    const [, h] = worldSize(300, 400, v)
    expect(screenPoint(10, 0, 300, 400, v)[1]).toBeCloseTo(400)
    expect(screenPoint(10, h, 300, 400, v)[1]).toBeCloseTo(0)
  })
  it('sentido natural para a direita: pedir para a esquerda espelha sem deitar', () => {
    const v = view({ flow: 'right', direction: 'left' })
    expect(worldSize(300, 400, v)).toEqual([300, 400])
    expect(screenPoint(0, 10, 300, 400, v)).toEqual([300, 10])
  })
  it('os cantos do mundo caem dentro da tela', () => {
    for (const direction of ['left', 'right', 'up', 'down'] as const) {
      const v = view({ direction, size: 1.5 })
      const [wx, wy] = worldSize(300, 400, v)
      for (const [x, y] of [
        [0, 0],
        [wx, 0],
        [0, wy],
        [wx, wy]
      ]) {
        const [sx, sy] = screenPoint(x, y, 300, 400, v)
        expect(sx).toBeGreaterThanOrEqual(-0.001)
        expect(sx).toBeLessThanOrEqual(300.001)
        expect(sy).toBeGreaterThanOrEqual(-0.001)
        expect(sy).toBeLessThanOrEqual(400.001)
      }
    }
  })
})

describe('viewScene', () => {
  const inner = (): Scene<{ w: number; h: number }> & { step: ReturnType<typeof vi.fn> } => ({
    init: (w, h) => ({ w, h }),
    step: vi.fn(),
    draw: (ctx) => ctx.fillRect(0, 0, 1, 1)
  })
  const P = { density: 1, speed: 1, color: '#ffffff' }

  it('sem ajuste nenhum devolve a própria cena (tema salvo desenha igual)', () => {
    const scene = inner()
    expect(viewScene(scene as Scene, view())).toBe(scene)
    expect(viewScene(scene as Scene, view({ flow: null, direction: 'left' }))).toBe(scene)
  })
  it('passa o mundo para a cena e aplica a transformação antes de desenhar', () => {
    const scene = inner()
    const wrapped = viewScene(scene as Scene, view({ size: 2, direction: 'left' }))
    const s = wrapped.init(300, 400, P, () => 0.5) as { inner: { w: number; h: number } }
    expect(s.inner).toEqual({ w: 200, h: 150 })
    const ctx = fakeCtx()
    wrapped.draw(ctx, s)
    expect(ctx.calls).toEqual(['translate', 'rotate', 'scale', 'fillRect'])
    expect(ctx.bad).toEqual([])
  })
  it('tamanho grande não dispara a velocidade na tela', () => {
    const scene = inner()
    const wrapped = viewScene(scene as Scene, view({ size: 4 }))
    const s = wrapped.init(300, 400, P, () => 0.5)
    wrapped.step(s, 0.1, () => 0.5)
    expect(scene.step.mock.calls[0][1]).toBeCloseTo(0.05)
  })
})
