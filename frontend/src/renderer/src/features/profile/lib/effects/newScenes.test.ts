import { describe, expect, it } from 'vitest'
import { fakeCtx } from './fakeCtx'
import type { BubblesState } from './bubbles'
import { BUNTING_COLORS, cordY, type BuntingState } from './bunting'
import type { CloudsState } from './clouds'
import type { FirefliesState } from './fireflies'
import { FIREWORK_COLORS, type FireworksState } from './fireworks'
import type { FogState } from './fog'
import { hexRadius, waveNumber, type HexagonsState } from './hexagons'
import { CANVAS_EFFECTS, seededRand } from './index'
import type { LavaState } from './lava'
import type { LeavesState } from './leaves'
import type { MeteorsState } from './meteors'
import type { MoneyState } from './money'
import { waveY, type OceanState } from './ocean'
import { SPRITES, type PixelsState } from './pixels'
import type { SakuraState } from './sakura'
import type { SunbeamsState } from './sunbeams'
import type { EffectParams } from './types'

const W = 300
const H = 450
const DT = 1 / 30
const params = (density = 1): EffectParams => ({ density, speed: 1, color: '#7cc4ff' })

interface Case {
  count(s: unknown): number
  inside(s: unknown, w: number, h: number): boolean
}

const CASES: Record<string, Case> = {
  fireflies: {
    count: (s) => (s as FirefliesState).flies.length,
    inside: (s, w, h) =>
      (s as FirefliesState).flies.every((f) => f.x >= -40 && f.x <= w + 40 && f.y >= -40 && f.y <= h + 40)
  },
  sakura: {
    count: (s) => (s as SakuraState).petals.length,
    inside: (s, w, h) =>
      (s as SakuraState).petals.every((f) => f.x >= -60 && f.x <= w + 60 && f.y >= -70 && f.y <= h + 60)
  },
  leaves: {
    count: (s) => (s as LeavesState).leaves.length,
    inside: (s, w, h) =>
      (s as LeavesState).leaves.every((f) => f.x >= -60 && f.x <= w + 60 && f.y >= -70 && f.y <= h + 60)
  },
  money: {
    count: (s) => (s as MoneyState).bills.length,
    inside: (s, w, h) =>
      (s as MoneyState).bills.every((f) => f.x >= -60 && f.x <= w + 60 && f.y >= -70 && f.y <= h + 60)
  },
  bubbles: {
    count: (s) => (s as BubblesState).bubbles.length,
    inside: (s, _w, h) => (s as BubblesState).bubbles.every((b) => b.y >= -60 && b.y <= h + 80)
  },
  ocean: {
    count: (s) => (s as OceanState).waves.length,
    inside: (s, _w, h) =>
      (s as OceanState).waves.every((g) => waveY(g, h, 0) >= h * 0.4 && waveY(g, h, 0) <= h * 1.2)
  },
  meteors: {
    count: (s) => (s as MeteorsState).stars.length + (s as MeteorsState).meteors.length,
    inside: (s, w, h) =>
      (s as MeteorsState).stars.every((x) => x.x <= w && x.y <= h) &&
      (s as MeteorsState).meteors.every((m) => m.life <= m.max + 0.2)
  },
  fog: {
    count: (s) => (s as FogState).puffs.length,
    inside: (s, w) => (s as FogState).puffs.every((f) => f.r <= 340 && f.x - f.r <= w + 30)
  },
  sunbeams: {
    count: (s) => (s as SunbeamsState).beams.length + (s as SunbeamsState).motes.length,
    inside: (s, w, h) => (s as SunbeamsState).motes.every((m) => m.x <= w + 20 && m.y <= h + 20)
  },
  lava: {
    count: (s) => (s as LavaState).blobs.length,
    inside: (s, w) => (s as LavaState).blobs.every((b) => b.x >= 0 && b.x <= w && b.lift < Math.PI)
  },
  clouds: {
    count: (s) => (s as CloudsState).clouds.length,
    inside: (s, w) => (s as CloudsState).clouds.every((c) => c.x - c.span <= w + 30)
  },
  hexagons: {
    count: (s) => (s as HexagonsState).cells.length,
    inside: (s) => (s as HexagonsState).cells.every((c) => c.light >= 0 && c.light <= 1)
  },
  pixels: {
    count: (s) => (s as PixelsState).invaders.length + (s as PixelsState).rain.length,
    inside: (s, _w, h) => (s as PixelsState).invaders.every((a) => a.y <= h + 60)
  },
  bunting: {
    count: (s) => (s as BuntingState).cords.reduce((n, c) => n + c.flags.length, 0),
    inside: (s) => (s as BuntingState).cords.every((c) => c.flags.every((f) => f.at > 0 && f.at < 1))
  },
  fireworks: {
    count: (s) => (s as FireworksState).sparks.length + (s as FireworksState).rockets.length,
    inside: (s) => (s as FireworksState).sparks.every((p) => p.life <= p.max)
  }
}

function allFinite(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v)
  if (Array.isArray(v)) return v.every(allFinite)
  if (v && typeof v === 'object') return Object.values(v).every(allFinite)
  return true
}

describe('efeitos novos', () => {
  it.each(Object.keys(CASES))('%s está no catálogo', (id) => {
    expect(CANVAS_EFFECTS[id], id).toBeDefined()
  })

  describe.each(Object.keys(CASES))('%s', (id) => {
    const scene = CANVAS_EFFECTS[id]
    const c = CASES[id]

    it('respeita o teto de elementos e cresce com a quantidade', () => {
      const rand = seededRand(1)
      const few = c.count(scene.init(W, 600, params(0.5), rand))
      const many = c.count(scene.init(W, 600, params(2), rand))
      const huge = c.count(scene.init(W, 600, params(100), rand))
      expect(few).toBeGreaterThanOrEqual(1)
      expect(many).toBeGreaterThanOrEqual(few)
      expect(huge).toBeLessThanOrEqual(160)
      expect(c.count(scene.init(W, 600, params(Number.NaN), rand))).toBeGreaterThanOrEqual(1)
    })

    it('tela cheia também fica dentro do teto', () => {
      expect(c.count(scene.init(2560, 1440, params(2.7), seededRand(2)))).toBeLessThanOrEqual(160)
    })

    it('30 s: tudo finito, na região, sem crescer e sem número inválido no desenho', () => {
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

    it('aguenta o passo máximo e cartões pequenos', () => {
      for (const [w, h] of [
        [300, 64],
        [120, 80],
        [64, 300]
      ]) {
        const rand = seededRand(3)
        const ctx = fakeCtx()
        const s = scene.init(w, h, params(2.7), rand)
        for (let i = 0; i < 300; i++) scene.step(s, 0.1, rand)
        scene.draw(ctx, s)
        expect(allFinite(s)).toBe(true)
        expect(ctx.bad).toEqual([])
      }
    })

    it('desenha alguma coisa', () => {
      const rand = seededRand(11)
      const ctx = fakeCtx()
      const s = scene.init(W, H, params(), rand)
      for (let i = 0; i < 240; i++) scene.step(s, DT, rand)
      scene.draw(ctx, s)
      expect(ctx.calls.filter((k) => ['fill', 'stroke', 'fillRect', 'fillText'].includes(k)).length).toBeGreaterThan(0)
    })

    it('é determinística com a mesma semente', () => {
      const run = (seed: number): unknown => {
        const rand = seededRand(seed)
        const s = scene.init(W, H, params(), rand)
        for (let i = 0; i < 200; i++) scene.step(s, DT, rand)
        return JSON.parse(JSON.stringify(s))
      }
      expect(run(42)).toEqual(run(42))
      expect(run(42)).not.toEqual(run(43))
    })
  })
})

describe('comportamentos específicos', () => {
  it('hexágonos: a célula cresce com a tela e o teto vale', () => {
    expect(hexRadius(2560, 1440, 150)).toBeGreaterThan(hexRadius(300, 450, 150))
    const s = CANVAS_EFFECTS.hexagons.init(2560, 1440, params(2.7), seededRand(1)) as HexagonsState
    expect(s.cells.length).toBeLessThanOrEqual(150)
    // A colmeia cobre a tela até embaixo.
    expect(Math.max(...s.cells.map((c) => c.y))).toBeGreaterThan(1440 * 0.85)
  })

  it('hexágonos: sempre há onda de luz na área, mesmo com o efeito ampliado', () => {
    for (const [w, h] of [
      [150, 200],
      [300, 450],
      [2560, 1440]
    ]) {
      const scene = CANVAS_EFFECTS.hexagons
      const rand = seededRand(1)
      const s = scene.init(w, h, params(), rand) as HexagonsState
      let dark = 0
      for (let i = 0; i < 300; i++) {
        scene.step(s, DT, rand)
        if (!s.cells.some((c) => c.light > 0.5)) dark++
      }
      expect(dark).toBe(0)
      expect((waveNumber(w, h) * Math.hypot(w, h)) / (2 * Math.PI)).toBeGreaterThan(1)
    }
  })

  it('fogos: estoura e as faíscas vêm do anel fixo', () => {
    const scene = CANVAS_EFFECTS.fireworks
    const rand = seededRand(4)
    const s = scene.init(W, H, params(), rand) as FireworksState
    const total = s.sparks.length
    let seen = 0
    for (let i = 0; i < 600; i++) {
      scene.step(s, DT, rand)
      seen = Math.max(seen, s.sparks.filter((p) => p.life < p.max).length)
    }
    expect(seen).toBeGreaterThan(20)
    expect(s.sparks).toHaveLength(total)
    for (const p of s.sparks) expect(FIREWORK_COLORS[p.color]).toBeDefined()
  })

  it('estrelas cadentes: todo meteoro acaba voltando a voar', () => {
    const scene = CANVAS_EFFECTS.meteors
    const rand = seededRand(5)
    const s = scene.init(W, H, params(), rand) as MeteorsState
    const flying = s.meteors.map(() => false)
    for (let i = 0; i < 600; i++) {
      scene.step(s, DT, rand)
      s.meteors.forEach((m, k) => {
        if (m.wait <= 0) flying[k] = true
      })
    }
    expect(flying.every(Boolean)).toBe(true)
  })

  it('bandeirinhas: o fio faz barriga e em tela larga as bandeiras só espaçam', () => {
    const s = CANVAS_EFFECTS.bunting.init(W, H, params(), seededRand(1)) as BuntingState
    const c = s.cords[0]
    expect(cordY(c, 0.5, 0)).toBeGreaterThan(cordY(c, 0, 0))
    for (const f of c.flags) expect(BUNTING_COLORS[f.color]).toBeDefined()
    const wide = CANVAS_EFFECTS.bunting.init(2560, 1440, params(), seededRand(1)) as BuntingState
    expect(wide.cords[0].flags.length).toBeLessThanOrEqual(32)
  })

  it('bandeirinhas: em área baixa (só o banner) os cordões não se atropelam', () => {
    const banner = CANVAS_EFFECTS.bunting.init(300, 64, params(2.7), seededRand(1)) as BuntingState
    expect(banner.cords).toHaveLength(1)
    expect(banner.cords[0].flagH + banner.cords[0].sag).toBeLessThanOrEqual(64)
    const tall = CANVAS_EFFECTS.bunting.init(300, 450, params(2.7), seededRand(1)) as BuntingState
    expect(tall.cords.length).toBeGreaterThan(1)
    for (let i = 1; i < tall.cords.length; i++) {
      const [a, b] = [tall.cords[i - 1], tall.cords[i]]
      expect(b.y).toBeGreaterThanOrEqual(a.y + a.flagH * 0.8)
    }
  })

  it('pixels: os dois quadros de cada invasor têm o mesmo tamanho', () => {
    for (const frames of SPRITES) {
      expect(frames).toHaveLength(2)
      expect(frames[0]).toHaveLength(frames[1].length)
      for (const frame of frames) {
        const width = frame[0].length
        for (const row of frame) expect(row).toHaveLength(width)
      }
    }
  })

  it('pixels: anda em passos inteiros da grade', () => {
    const scene = CANVAS_EFFECTS.pixels
    const rand = seededRand(6)
    const s = scene.init(W, H, params(), rand) as PixelsState
    for (let i = 0; i < 300; i++) scene.step(s, DT, rand)
    for (const a of s.invaders) {
      expect(a.x % 3).toBe(0)
      expect(Math.abs(a.y % 3)).toBe(0)
    }
  })

  it('bolhas sobem e lava mantém a superfície', () => {
    const rand = seededRand(8)
    const b = CANVAS_EFFECTS.bubbles.init(W, H, params(), rand) as BubblesState
    const y0 = b.bubbles[0].y
    CANVAS_EFFECTS.bubbles.step(b, DT, rand)
    expect(b.bubbles[0].y).toBeLessThan(y0)
    const l = CANVAS_EFFECTS.lava.init(W, H, params(), rand) as LavaState
    expect(l.surface).toBeCloseTo(H * 0.8)
  })
})
