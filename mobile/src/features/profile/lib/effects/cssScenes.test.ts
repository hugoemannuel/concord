import { fakeCtx } from './fakeCtx'
import { CANVAS_EFFECTS, canvasScene, seededRand } from './index'
import { particleAlpha, particlesScene, type ParticlesState } from './particles'
import { snowScene, type SnowState } from './snow'
import { sparklesScene, twinkle, type SparklesState } from './sparkles'
import type { EffectParams } from './types'

// Os três efeitos que no desktop são CSS (partículas, brilhos, neve) são cenas do mesmo laço aqui.
const W = 300
const H = 400
const params = (density = 1, color = '#c4b5fd'): EffectParams => ({ density, speed: 1, color })

describe('quantidade (a do desktop: 14, 10 e 18, teto de 40)', () => {
  const cases: [string, number, () => number][] = [
    ['particles', 14, () => particlesScene.init(W, H, params(), seededRand(1)).items.length],
    ['sparkles', 10, () => sparklesScene.init(W, H, params(), seededRand(1)).items.length],
    ['snow', 18, () => snowScene.init(W, H, params(), seededRand(1)).items.length]
  ]
  it.each(cases)('%s: %d por padrão', (_id, expected, count) => {
    expect(count()).toBe(expected)
  })

  it('densidade alta nunca passa de 40 e baixa nunca zera', () => {
    for (const scene of [particlesScene, sparklesScene, snowScene]) {
      expect(scene.init(W, H, params(2.7), seededRand(1)).items.length).toBeLessThanOrEqual(40)
      expect(scene.init(W, H, params(0.01), seededRand(1)).items.length).toBeGreaterThanOrEqual(1)
      expect(scene.init(W, H, params(Number.NaN), seededRand(1)).items.length).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('partículas', () => {
  it('abrem espalhadas pelo cartão e já no meio da vida (não começa vazio)', () => {
    const s: ParticlesState = particlesScene.init(W, H, params(), seededRand(3))
    for (const p of s.items) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(W)
      expect(p.y0).toBeGreaterThanOrEqual(0)
      expect(p.y0).toBeLessThanOrEqual(H)
      expect(p.size).toBeGreaterThanOrEqual(2)
      expect(p.size).toBeLessThanOrEqual(5)
    }
    expect(new Set(s.items.map((p) => Math.round(p.age * 10))).size).toBeGreaterThan(1)
  })

  it('o brilho nasce, fica e some (0 → 0,55 → 0)', () => {
    expect(particleAlpha(0)).toBe(0)
    expect(particleAlpha(0.1)).toBeCloseTo(0.275)
    expect(particleAlpha(0.2)).toBeCloseTo(0.55)
    expect(particleAlpha(0.5)).toBeCloseTo(0.55)
    expect(particleAlpha(0.7)).toBeCloseTo(0.55)
    expect(particleAlpha(1)).toBeCloseTo(0)
  })

  it('step envelhece e recomeça quando a vida acaba', () => {
    const rand = seededRand(4)
    const s = particlesScene.init(W, H, params(), rand)
    for (let i = 0; i < 400; i++) particlesScene.step(s, 0.1, rand)
    for (const p of s.items) {
      expect(p.age).toBeGreaterThanOrEqual(0)
      expect(p.age).toBeLessThan(p.duration)
    }
  })

  it('draw usa a cor do tema, só números finitos e desenha uma bolinha por partícula', () => {
    const ctx = fakeCtx()
    const s = particlesScene.init(W, H, params(1, '#ff00aa'), seededRand(5))
    particlesScene.draw(ctx, s)
    expect(ctx.fillStyle).toBe('#ff00aa')
    expect(ctx.calls.filter((c) => c === 'arc')).toHaveLength(s.items.length)
    expect(ctx.calls.filter((c) => c === 'fill')).toHaveLength(s.items.length)
    expect(ctx.bad).toEqual([])
    expect(ctx.globalAlpha).toBeGreaterThanOrEqual(0)
    expect(ctx.globalAlpha).toBeLessThanOrEqual(1)
  })
})

describe('brilhos', () => {
  it('pulsam: somem nas pontas do ciclo e brilham no meio (escala 0,4 → 1, giro de até 45°)', () => {
    expect(twinkle(0)).toMatchObject({ alpha: 0, scale: 0.4 })
    const mid = twinkle(0.5)
    expect(mid.alpha).toBeCloseTo(0.9)
    expect(mid.scale).toBeCloseTo(1)
    expect(mid.rot).toBeCloseTo(Math.PI / 4)
    expect(twinkle(1).alpha).toBeCloseTo(0)
  })

  it('tamanho de 8 a 14 dp e posições dentro do cartão', () => {
    const s: SparklesState = sparklesScene.init(W, H, params(), seededRand(6))
    for (const p of s.items) {
      expect(p.size).toBeGreaterThanOrEqual(8)
      expect(p.size).toBeLessThanOrEqual(14)
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(W)
    }
  })

  it('draw: uma estrela por brilho, save e restore equilibrados, sem número inválido', () => {
    const ctx = fakeCtx()
    const s = sparklesScene.init(W, H, params(1, '#ffd84d'), seededRand(7))
    sparklesScene.draw(ctx, s)
    expect(ctx.calls.filter((c) => c === 'fill')).toHaveLength(s.items.length)
    expect(ctx.calls.filter((c) => c === 'save')).toHaveLength(ctx.calls.filter((c) => c === 'restore').length)
    expect(ctx.fillStyle).toBe('#ffd84d')
    expect(ctx.bad).toEqual([])
  })
})

describe('neve', () => {
  it('cai e, ao sair pelo fundo, volta pelo topo em outra posição', () => {
    const rand = seededRand(8)
    const s: SnowState = snowScene.init(W, H, params(), rand)
    const before = s.items.map((f) => f.y)
    snowScene.step(s, 0.1, rand)
    expect(s.items.every((f, i) => f.y > before[i] || f.y < 0)).toBe(true)
    for (let i = 0; i < 600; i++) snowScene.step(s, 0.1, rand)
    for (const f of s.items) {
      expect(f.y).toBeGreaterThanOrEqual(-f.size - 1)
      expect(f.y).toBeLessThanOrEqual(H + f.size + 1)
    }
  })

  it('draw: um floco por item na cor do tema, sem número inválido', () => {
    const ctx = fakeCtx()
    const s = snowScene.init(W, H, params(1, '#ffffff'), seededRand(9))
    snowScene.draw(ctx, s)
    expect(ctx.calls.filter((c) => c === 'arc')).toHaveLength(s.items.length)
    expect(ctx.fillStyle).toBe('#ffffff')
    expect(ctx.bad).toEqual([])
  })
})

describe('cartão sem tamanho ou com parâmetros ruins', () => {
  it.each([
    ['particles', particlesScene],
    ['sparkles', sparklesScene],
    ['snow', snowScene]
  ] as const)('%s com 0×0 e velocidade absurda não lança erro', (_id, scene) => {
    const rand = seededRand(10)
    const ctx = fakeCtx()
    const s = scene.init(0, 0, params(), rand)
    scene.step(s as never, 0.1, rand)
    scene.draw(ctx, s as never)
    expect(ctx.bad).toEqual([])
  })
})

describe('registro', () => {
  it('as 28 cenas existem; none, desconhecido e nomes herdados do objeto, não', () => {
    for (const id of ['fire', 'matrix', 'glitch', 'storm', 'galaxy', 'aurora', 'hearts', 'confetti', 'synthwave', 'rain', 'particles', 'sparkles', 'snow']) {
      expect(canvasScene(id)).not.toBeNull()
    }
    expect(Object.keys(CANVAS_EFFECTS)).toHaveLength(28)
    for (const id of ['none', 'fogos', '', 'toString', '__proto__']) expect(canvasScene(id)).toBeNull()
  })
})
