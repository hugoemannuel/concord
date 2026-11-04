import type { AuroraState } from './aurora'
import type { ConfettiState } from './confetti'
import { fakeCtx } from './fakeCtx'
import { FLAME_TOP, tongueHeight, type FireState } from './fire'
import type { GalaxyState } from './galaxy'
import type { GlitchState } from './glitch'
import type { HeartsState } from './hearts'
import { CANVAS_EFFECTS, canvasScene, seededRand } from './index'
import { MATRIX_FS, type MatrixState } from './matrix'
import type { RainState } from './rain'
import { STORM_SEGS, type StormState } from './storm'
import type { SynthwaveState } from './synthwave'
import type { EffectParams } from './types'

const W = 300
const H = 450
const DT = 1 / 30
const params = (density = 1): EffectParams => ({ density, speed: 1, color: '#ff7a1a' })

interface Case {
  /** Quantos elementos a cena simula. */
  count(s: unknown): number
  /** Os elementos continuam numa região razoável do cartão. */
  inside(s: unknown, w: number, h: number): boolean
  /** A cena não sorteia nada (a semente não muda o resultado). */
  fixed?: boolean
}

const every = <T>(xs: T[], ok: (x: T) => boolean): boolean => xs.every(ok)

const CASES: Record<string, Case> = {
  fire: {
    count: (s) => (s as FireState).tongues.length + (s as FireState).sparks.length,
    // As chamas não passam da metade; as faíscas sobem mais, mas não até o topo.
    inside: (s, w, h) => {
      const f = s as FireState
      return (
        every(f.tongues, (g) => tongueHeight(g, f.t) <= h * FLAME_TOP && g.x >= 0 && g.x <= w) &&
        every(f.sparks, (e) => e.x > -60 && e.x < w + 60 && e.y > h * 0.1 && e.y <= h)
      )
    }
  },
  matrix: {
    count: (s) => (s as MatrixState).drops.length,
    inside: (s, _w, h) =>
      every(
        (s as MatrixState).drops,
        (d) =>
          d.col >= 0 &&
          d.col < (s as MatrixState).cols &&
          d.y >= -h &&
          d.y <= h + (d.len + 2) * MATRIX_FS
      )
  },
  glitch: {
    count: (s) => (s as GlitchState).slices.length + (s as GlitchState).blocks.length,
    inside: (s, _w, h) =>
      every((s as GlitchState).slices, (sl) => sl.y >= 0 && sl.y <= h) &&
      (s as GlitchState).active <= (s as GlitchState).slices.length
  },
  storm: {
    count: (s) => (s as StormState).drops.length,
    inside: (s, w, h) =>
      (s as StormState).count <= STORM_SEGS &&
      every((s as StormState).drops, (d) => d.x > -w && d.x < w * 2 && d.y > -h && d.y <= h + 20)
  },
  galaxy: {
    count: (s) => (s as GalaxyState).stars.length,
    inside: (s) => {
      const g = s as GalaxyState
      return every(g.stars, (st) => st.r >= g.coreR * 0.5 && st.r <= g.maxR * 1.01)
    }
  },
  aurora: {
    count: (s) => (s as AuroraState).bands.length,
    inside: (s, _w, h) => every((s as AuroraState).bands, (b) => b.base < h / 2)
  },
  hearts: {
    count: (s) => (s as HeartsState).hearts.length,
    inside: (s, w, h) =>
      every(
        (s as HeartsState).hearts,
        (c) => c.x >= 0 && c.x <= w && c.y >= -40 && c.y <= h * 1.35 && Math.abs(c.rot) <= 0.45
      )
  },
  confetti: {
    count: (s) => (s as ConfettiState).pieces.length,
    inside: (s, w, h) =>
      every(
        (s as ConfettiState).pieces,
        (c) => c.x >= -13 && c.x <= w + 13 && c.y >= -45 && c.y <= h + 15
      )
  },
  synthwave: {
    count: (s) => (s as SynthwaveState).rows + (s as SynthwaveState).half * 2 + 1,
    inside: (s) => (s as SynthwaveState).offset >= 0 && (s as SynthwaveState).offset < 1,
    fixed: true
  },
  rain: {
    count: (s) => (s as RainState).drops.length + (s as RainState).splashes.length,
    inside: (s, w, h) =>
      every((s as RainState).drops, (d) => d.x > -h && d.x < w * 2 && d.y > -h && d.y <= h + 20)
  }
}

/** Todo número do estado (inclusive em listas e Float32Array) é finito. */
function allFinite(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v)
  if (v instanceof Float32Array) return v.every(Number.isFinite)
  if (Array.isArray(v)) return v.every(allFinite)
  if (v && typeof v === 'object') return Object.values(v).every(allFinite)
  return true
}

function run(id: string, seed: number, steps: number, dt = DT, density = 1): unknown {
  const scene = CANVAS_EFFECTS[id]
  const rand = seededRand(seed)
  const s = scene.init(W, H, params(density), rand)
  for (let i = 0; i < steps; i++) scene.step(s, dt, rand)
  return s
}

describe('cenas de canvas', () => {
  // Partículas, brilhos e neve são CSS no desktop e têm o próprio teste (cssScenes.test.ts).
  const CSS_NO_DESKTOP = ['particles', 'sparkles', 'snow']

  it('o catálogo tem os 10 efeitos de canvas, cada um com um caso de teste, mais os 3 que eram CSS', () => {
    const canvas = Object.keys(CANVAS_EFFECTS).filter((id) => !CSS_NO_DESKTOP.includes(id))
    expect(canvas).toEqual(expect.arrayContaining(Object.keys(CASES)))
    expect(Object.keys(CANVAS_EFFECTS)).toHaveLength(28)
  })

  describe.each(Object.keys(CASES))('%s', (id) => {
    const scene = CANVAS_EFFECTS[id]
    const c = CASES[id]

    it('init respeita o teto e cresce com a densidade', () => {
      const rand = seededRand(1)
      const few = c.count(scene.init(W, 600, params(0.5), rand))
      const many = c.count(scene.init(W, 600, params(2), rand))
      const huge = c.count(scene.init(W, 600, params(100), rand))
      expect(few).toBeGreaterThanOrEqual(1)
      expect(many).toBeGreaterThanOrEqual(few)
      expect(huge).toBeLessThanOrEqual(160)
      expect(c.count(scene.init(W, 600, params(Number.NaN), rand))).toBeGreaterThanOrEqual(1)
    })

    it('30 s de simulação: tudo finito, na região e sem crescer', () => {
      const rand = seededRand(7)
      const ctx = fakeCtx()
      const s = scene.init(W, H, params(1.5), rand)
      const n = c.count(s)
      for (let i = 0; i < 900; i++) {
        scene.step(s, DT, rand)
        scene.draw(ctx, s)
      }
      expect(c.count(s)).toBe(n)
      expect(allFinite(s)).toBe(true)
      expect(c.inside(s, W, H)).toBe(true)
      expect(ctx.bad).toEqual([])
    })

    it('aguenta o passo máximo (0,1 s) e cartões de tamanhos diferentes', () => {
      for (const [w, h] of [
        [300, 350],
        [300, 600],
        [120, 80]
      ]) {
        const rand = seededRand(3)
        const s = scene.init(w, h, params(2.7), rand)
        for (let i = 0; i < 300; i++) scene.step(s, 0.1, rand)
        expect(allFinite(s)).toBe(true)
        expect(c.inside(s, w, h)).toBe(true)
      }
    })

    it('draw desenha no contexto sem lançar', () => {
      const ctx = fakeCtx()
      const s = run(id, 11, 60)
      expect(() => scene.draw(ctx, s)).not.toThrow()
      expect(ctx.calls.length).toBeGreaterThan(0)
      expect(ctx.bad).toEqual([])
    })

    it('é determinística com a mesma semente', () => {
      expect(run(id, 42, 200)).toEqual(run(id, 42, 200))
      if (!c.fixed) expect(run(id, 42, 200)).not.toEqual(run(id, 43, 200))
    })
  })
})

describe('canvasScene', () => {
  it('acha as cenas e devolve null para o resto', () => {
    expect(canvasScene('fire')).toBe(CANVAS_EFFECTS.fire)
    expect(canvasScene('snow')).toBe(CANVAS_EFFECTS.snow)
    expect(canvasScene('fogos')).toBeNull()
    expect(canvasScene('none')).toBeNull()
    expect(canvasScene('toString')).toBeNull()
  })
})

describe('seededRand', () => {
  it('fica em [0, 1) e repete com a mesma semente', () => {
    const a = seededRand(5)
    const b = seededRand(5)
    for (let i = 0; i < 1000; i++) {
      const x = a()
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
      expect(b()).toBe(x)
    }
  })
})

describe('comportamentos específicos', () => {
  it('fogo: chamas chegam a ~1/3 da altura e faíscas sobem acima delas', () => {
    const scene = CANVAS_EFFECTS.fire
    const rand = seededRand(2)
    const s = scene.init(300, 380, params(), rand) as FireState
    let flame = 0
    let spark = 380
    for (let i = 0; i < 300; i++) {
      scene.step(s, DT, rand)
      for (const g of s.tongues) flame = Math.max(flame, tongueHeight(g, s.t))
      for (const e of s.sparks) spark = Math.min(spark, e.y)
    }
    expect(flame).toBeGreaterThan(380 * 0.3)
    expect(spark).toBeLessThan(380 - flame)
  })

  it('glitch: quase sempre parado, com rajadas curtas', () => {
    const scene = CANVAS_EFFECTS.glitch
    const rand = seededRand(9)
    const s = scene.init(W, H, params(), rand) as GlitchState
    let bursting = 0
    let bursts = 0
    let was = false
    for (let i = 0; i < 1800; i++) {
      scene.step(s, DT, rand)
      const now = s.burst > 0
      if (now) bursting++
      if (now && !was) bursts++
      was = now
    }
    expect(bursts).toBeGreaterThanOrEqual(15)
    expect(bursting / 1800).toBeLessThan(0.3)
  })

  it('tempestade: cai raio com clarão que apaga rápido', () => {
    const scene = CANVAS_EFFECTS.storm
    const rand = seededRand(4)
    const s = scene.init(W, H, params(), rand) as StormState
    let i = 0
    while (s.flash === 0 && i++ < 300) scene.step(s, DT, rand)
    expect(s.flash).toBeGreaterThan(0.8)
    expect(s.count).toBeGreaterThan(5)
    for (let k = 0; k < 10; k++) scene.step(s, DT, rand)
    expect(s.flash).toBe(0)
  })

  it('tempestade: um raio a cada 1,5–4 s', () => {
    const scene = CANVAS_EFFECTS.storm
    const rand = seededRand(8)
    const s = scene.init(W, H, params(), rand) as StormState
    let strikes = 0
    for (let i = 0; i < 1800; i++) {
      const before = s.flash
      scene.step(s, DT, rand)
      if (s.flash > before) strikes++
    }
    expect(strikes).toBeGreaterThanOrEqual(60 / 4.4)
    expect(strikes).toBeLessThanOrEqual(60 / 1.5 + 1)
  })

  it('corações: tamanhos variados entre 8 e 22 px', () => {
    const s = CANVAS_EFFECTS.hearts.init(W, H, params(2), seededRand(6)) as HeartsState
    const sizes = s.hearts.map((c) => c.size)
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(8)
    expect(Math.max(...sizes)).toBeLessThanOrEqual(22)
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeGreaterThan(8)
  })

  it('aurora: 2 faixas com pouca densidade, 3 com mais', () => {
    const rand = seededRand(1)
    expect((CANVAS_EFFECTS.aurora.init(W, H, params(0.5), rand) as AuroraState).bands).toHaveLength(
      2
    )
    expect((CANVAS_EFFECTS.aurora.init(W, H, params(1), rand) as AuroraState).bands).toHaveLength(3)
  })

  it('matrix: colunas limitadas pela largura', () => {
    const s = CANVAS_EFFECTS.matrix.init(140, H, params(100), seededRand(1)) as MatrixState
    expect(s.cols).toBe(10)
    expect(s.drops.length).toBeLessThanOrEqual(20)
  })
})
