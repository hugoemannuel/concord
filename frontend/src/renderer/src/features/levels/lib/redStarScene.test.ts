import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeCtx } from './fakeCanvas'
import type { SceneInput } from './milestoneScenes'
import { RED_STAR_COLORS, redStarLayout, redStarScene } from './redStarScene'
import { rng, starPoints } from './sceneKit'
import { buildScreenScene } from './screenScene'

const input = (w: number, h: number, budget = 60): SceneInput => ({
  w,
  h,
  level: 13,
  color: '#d50000',
  accent: '#8e0000',
  colors: RED_STAR_COLORS,
  budget,
  power: 0.1,
  durationMs: 3400,
  fontPx: Math.round(Math.min(w * 0.24, h * 0.32, 280)),
  cx: w / 2,
  cy: h * 0.46
})

describe('cena do nível 13 (estrela vermelha)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('as cores são vermelhos e dourados, com o vermelho #D50000', () => {
    expect(RED_STAR_COLORS).toContain('#d50000')
    expect(RED_STAR_COLORS).toContain('#ffd54f')
    for (const color of RED_STAR_COLORS) expect(color).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('a estrela de 5 pontas tem a ponta de cima apontando para cima', () => {
    const p = starPoints(100, 100, 50, -Math.PI / 2)
    expect(p).toHaveLength(20)
    expect(p[0]).toBeCloseTo(100)
    expect(p[1]).toBeCloseTo(50)
    // Vales a ~38% do raio e as 5 pontas todas a 50 px do centro.
    for (let i = 0; i < 20; i += 4) expect(Math.hypot(p[i] - 100, p[i + 1] - 100)).toBeCloseTo(50)
    expect(Math.hypot(p[2] - 100, p[3] - 100)).toBeCloseTo(50 * 0.381966, 3)
  })

  it('a estrela cabe na tela e guarda o número no corpo, do celular ao monitor largo', () => {
    for (const [w, h] of [
      [360, 740],
      [768, 1024],
      [1280, 720],
      [2560, 1080]
    ]) {
      const s = input(w, h)
      const star = redStarLayout(s)
      expect(star.cx, `${w}x${h}`).toBe(s.cx)
      expect(star.cy).toBe(s.cy)
      expect(star.cx - star.outer).toBeGreaterThanOrEqual(0)
      expect(star.cx + star.outer).toBeLessThanOrEqual(w)
      expect(star.cy - star.outer).toBeGreaterThanOrEqual(0)
      expect(star.cy + star.outer * 0.81).toBeLessThanOrEqual(h)
      expect(star.outer).toBeGreaterThanOrEqual(s.fontPx * 0.9)
    }
  })

  it('nunca cria mais partículas que o orçamento', () => {
    for (const budget of [0, 5, 40, 80]) {
      const scene = redStarScene(input(1280, 720, budget), rng(1), fakeCtx().ctx)
      expect(scene.particles).toBeLessThanOrEqual(budget)
    }
    expect(redStarScene(input(1280, 720, 60), rng(1), fakeCtx().ctx).particles).toBe(60)
  })

  it('desenha a estrela, os raios, as faíscas e some no fim', () => {
    const sprite = { width: 0, height: 0, getContext: () => fakeCtx().ctx }
    vi.stubGlobal('document', { createElement: () => sprite })
    const { ctx, calls } = fakeCtx()
    const scene = buildScreenScene('redstar', input(1280, 720), ctx)
    for (const t of [0, 200, 400, 900, 1500, 2400, 3000, 3399]) scene.draw(ctx, t)
    expect(calls.fill).toBeGreaterThan(10)
    expect(calls.stroke).toBeGreaterThan(0)
    expect(calls.drawImage).toBeGreaterThan(0)
    expect(() => scene.draw(ctx, 3400)).not.toThrow()
  })
})
