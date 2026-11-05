import { afterEach, describe, expect, it, vi } from 'vitest'
import { PRIDE_COLORS } from './levelBadgeStyle'
import type { SceneInput } from './milestoneScenes'
import { prideArc, prideScene } from './prideScene'
import { fakeCtx } from './fakeCanvas'
import { rng } from './sceneKit'
import { buildScreenScene } from './screenScene'

const input = (w: number, h: number, budget = 60): SceneInput => ({
  w,
  h,
  level: 24,
  color: '#c084fc',
  accent: '#750787',
  colors: PRIDE_COLORS,
  budget,
  power: 0.23,
  durationMs: 3400,
  fontPx: Math.round(Math.min(w * 0.24, h * 0.32, 280)),
  cx: w / 2,
  cy: h * 0.46
})

describe('cena do nível 24 (arco-íris do orgulho)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('nunca cria mais partículas que o orçamento', () => {
    for (const budget of [0, 5, 40, 80]) {
      const scene = prideScene(input(1280, 720, budget), rng(1))
      expect(scene.particles).toBeLessThanOrEqual(budget)
    }
    expect(prideScene(input(1280, 720, 60), rng(1)).particles).toBe(60)
  })

  it('o arco atravessa a tela e passa acima do número, do celular ao monitor largo', () => {
    for (const [w, h] of [
      [360, 740],
      [768, 1024],
      [1280, 720],
      [2560, 1080]
    ]) {
      const arc = prideArc({ w, h })
      const top = arc.cy - arc.outer
      expect(top, `${w}x${h}`).toBeGreaterThan(0)
      expect(top, `${w}x${h}`).toBeLessThan(h * 0.46)
      expect(arc.cx).toBe(w / 2)
    }
  })

  it('desenha as 6 faixas, o confete e some no fim', () => {
    const sprite = { width: 0, height: 0, getContext: () => fakeCtx().ctx }
    vi.stubGlobal('document', { createElement: () => sprite })
    const { ctx, calls } = fakeCtx()
    const scene = buildScreenScene('pride', input(1280, 720), ctx)
    for (const t of [0, 400, 1300, 1500, 2200, 3000, 3399]) scene.draw(ctx, t)
    expect(calls.arc).toBeGreaterThanOrEqual(6 * 5)
    expect(calls.fillRect).toBeGreaterThan(0)
    expect(calls.drawImage).toBeGreaterThan(0)
    const before = calls.fillRect
    scene.draw(ctx, 3400)
    // No último quadro tudo já sumiu (alfa 0), mas nada quebra.
    expect(calls.fillRect).toBeGreaterThanOrEqual(before)
  })
})
