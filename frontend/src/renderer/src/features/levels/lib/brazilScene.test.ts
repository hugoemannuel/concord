import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BRAZIL_COLORS,
  brazilFlagGeometry,
  brazilFlagLayout,
  brazilScene,
  flagWave
} from './brazilScene'
import { fakeCtx } from './fakeCanvas'
import type { SceneInput } from './milestoneScenes'
import { rng } from './sceneKit'
import { buildScreenScene } from './screenScene'

const input = (w: number, h: number, budget = 60): SceneInput => ({
  w,
  h,
  level: 22,
  color: '#009c3b',
  accent: '#002776',
  colors: BRAZIL_COLORS,
  budget,
  power: 0.2,
  durationMs: 3400,
  fontPx: Math.round(Math.min(w * 0.24, h * 0.32, 280)),
  cx: w / 2,
  cy: h * 0.46
})

/** document falso: o desenho da bandeira vai para um canvas escondido. */
function stubDocument(): void {
  const sprite = { width: 0, height: 0, getContext: () => fakeCtx().ctx }
  vi.stubGlobal('document', { createElement: () => sprite })
}

describe('cena do nível 22 (bandeira do Brasil)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('usa as cores oficiais: verde, amarelo, azul e branco', () => {
    for (const color of ['#009c3b', '#ffdf00', '#002776', '#ffffff']) {
      expect(BRAZIL_COLORS).toContain(color)
    }
  })

  it('a bandeira segue as proporções oficiais (20×14 módulos)', () => {
    const g = brazilFlagGeometry(200, 140)
    // Retângulo 20:14, losango a 1,7 módulo das bordas e globo de 3,5 módulos.
    expect(g.rhombus).toEqual([
      [17, 70],
      [100, 17],
      [183, 70],
      [100, 123]
    ])
    expect(g.globe).toEqual({ x: 100, y: 70, r: 35 })
    // O globo cabe dentro do losango.
    expect(g.globe.y + g.globe.r).toBeLessThan(123)
    expect(g.globe.x + g.globe.r).toBeLessThan(183)
  })

  it('a bandeira cabe na tela e tem a razão 10:7, do celular ao monitor largo', () => {
    for (const [w, h] of [
      [360, 740],
      [768, 1024],
      [1280, 720],
      [2560, 1080]
    ]) {
      const s = input(w, h)
      const flag = brazilFlagLayout(s)
      expect(flag.w / flag.h, `${w}x${h}`).toBeCloseTo(10 / 7, 5)
      expect(flag.cx - flag.w / 2).toBeGreaterThanOrEqual(0)
      expect(flag.cx + flag.w / 2).toBeLessThanOrEqual(w)
      expect(flag.cy - flag.h / 2).toBeGreaterThanOrEqual(0)
      expect(flag.cy + flag.h / 2).toBeLessThanOrEqual(h)
    }
  })

  it('o tremular prende a ponta do mastro e solta o resto', () => {
    expect(flagWave(0, 500, 10)).toBeCloseTo(0, 0)
    let max = 0
    for (let x = 0; x <= 1; x += 0.05) max = Math.max(max, Math.abs(flagWave(x, 500, 10)))
    expect(max).toBeGreaterThan(3)
    expect(max).toBeLessThanOrEqual(10)
    // Muda no tempo.
    expect(flagWave(0.7, 0, 10)).not.toBeCloseTo(flagWave(0.7, 400, 10))
  })

  it('nunca cria mais partículas que o orçamento', () => {
    stubDocument()
    for (const budget of [0, 5, 40, 80]) {
      const scene = brazilScene(input(1280, 720, budget), rng(1), fakeCtx().ctx)
      expect(scene.particles).toBeLessThanOrEqual(budget)
    }
    expect(brazilScene(input(1280, 720, 60), rng(1), fakeCtx().ctx).particles).toBe(60)
  })

  it('desenha a bandeira em faixas, o confete e some no fim', () => {
    stubDocument()
    const { ctx, calls } = fakeCtx()
    const scene = buildScreenScene('brazil', input(1280, 720), ctx)
    for (const t of [0, 300, 800, 1500, 2400, 3000, 3399]) scene.draw(ctx, t)
    expect(calls.drawImage).toBeGreaterThanOrEqual(32 * 3)
    expect(calls.fillRect).toBeGreaterThan(0)
    expect(() => scene.draw(ctx, 3400)).not.toThrow()
  })
})
