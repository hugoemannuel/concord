import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeCtx } from './fakeCanvas'
import { levelUpEffects, MAX_PARTICLES } from './levels'
import { buildScene, IMPACT_MS, type SceneInput } from './milestoneScenes'
import { rng } from './sceneKit'
import { sceneLayout, screenSceneFor } from './screenScene'
import { makeVineArt } from './vinesArt'
import { makeBackLayer, makeMainLayer, makeWreathLayer, type VineLayer } from './vinesLayer'
import { vinesStage } from './vinesGeometry'
import { growEase, invGrowEase, VINES_IMPACT_MS, VINES_TITLE_MS, WREATH_TO } from './vinesTimeline'
import { vinesScene } from './vinesScene'

const SCREENS = [
  [360, 740],
  [360, 640],
  [768, 1024],
  [800, 400],
  [1280, 720],
  [1920, 1080],
  [2560, 1080],
  [2560, 1440]
]

const input = (w: number, h: number, budget = 50): SceneInput => ({
  ...sceneLayout(w, h),
  level: 30,
  color: '#34d399',
  accent: '#047857',
  colors: ['#34d399', '#047857', '#ffffff'],
  budget,
  power: 0.3,
  durationMs: 3400
})

/** O canvas escondido dos pré-desenhos (null: sem contexto 2D). */
function stubSprites(sprite: CanvasRenderingContext2D | null): void {
  vi.stubGlobal('document', {
    createElement: () => ({ width: 0, height: 0, getContext: () => sprite })
  })
}

const FRAMES = [0, 200, 500, 800, 1100, 1200, 1250, 1600, 2200, 2800, 3200, 3399]

/** Onde estão as flores, gemas e folhas presas à vinha, sem o balanço. */
function anchors(layer: VineLayer): { x: number; y: number }[] {
  return [...layer.buds, ...layer.blooms, ...layer.nodes].map((a) => ({
    x: a.vine.x[a.k],
    y: a.vine.y[a.k]
  }))
}

describe('cena do marco 30: ritmo e título', () => {
  it('o título entra junto com o impacto e fica legível até o fim', () => {
    const scene = screenSceneFor(30, 29)!
    expect(scene.kind).toBe('vines')
    expect(scene.impactMs).toBe(VINES_IMPACT_MS)
    expect(IMPACT_MS.vines).toBe(VINES_IMPACT_MS)
    expect(scene.titleAt).toBe(VINES_TITLE_MS)
    expect(scene.titleAt).toBeGreaterThanOrEqual(scene.impactMs)
    expect(scene.durationMs).toBe(3400)
    expect(scene.durationMs - scene.titleAt).toBeGreaterThan(1800)
    expect(scene.numberText).toBe('30')
    // Sem texto novo: o rótulo continua o do marco.
    expect(scene.label).toBe('Marco 30 · Vinhas de esmeralda')
    expect(scene.drawsNumber).toBe(false)
    // Sem o tom escuro da faixa, que sumiria no verde da mata.
    expect(scene.gradient).not.toContain('#047857')
    // Os outros marcos seguem com o degradê da faixa.
    expect(screenSceneFor(40, 39)!.gradient).toContain('#1d4ed8')
  })

  it('o crescimento começa logo e a curva inversa bate com a direta', () => {
    expect(growEase(0.3)).toBeGreaterThan(0.15)
    for (const y of [0, 0.1, 0.4, 0.5, 0.75, 1]) {
      expect(growEase(invGrowEase(y))).toBeCloseTo(y, 5)
    }
  })

  it('a coroa de folhas termina de fechar antes do impacto', () => {
    expect(WREATH_TO).toBeLessThanOrEqual(VINES_IMPACT_MS)
  })

  it('cabe no orçamento do nível 30', () => {
    const scene = screenSceneFor(30, 29)!
    const fx = levelUpEffects(30, 29)
    expect(scene.budget + fx.sparks + fx.orbit + fx.confetti + fx.stars).toBeLessThanOrEqual(
      MAX_PARTICLES
    )
  })
})

describe('geometria das vinhas, de 360 a 2560 px', () => {
  beforeEach(() => stubSprites(fakeCtx().ctx))
  afterEach(() => vi.unstubAllGlobals())

  it('a coroa cerca o número e cabe na tela, com a esmeralda no topo', () => {
    for (const [w, h] of SCREENS) {
      const stage = vinesStage(sceneLayout(w, h))
      const l = sceneLayout(w, h)
      const size = `${w}x${h}`
      expect(stage.cx, size).toBe(w / 2)
      // Dois dígitos ocupam cerca de 1,2 fonte de largura.
      expect(stage.R, size).toBeGreaterThan(l.fontPx * 0.66)
      expect(stage.cy - stage.R - stage.crown, size).toBeGreaterThan(0)
      expect(stage.cy + stage.R * 1.1, size).toBeLessThan(h)
      expect(stage.cx - stage.R * 1.1, size).toBeGreaterThan(0)
      expect(stage.cx + stage.R * 1.1, size).toBeLessThan(w)
    }
  })

  it('as vinhas principais saem da borda, não entram na coroa e chegam nela', () => {
    for (const [w, h] of SCREENS) {
      const stage = vinesStage(sceneLayout(w, h))
      const { ctx } = fakeCtx()
      const layer = makeMainLayer(stage, makeVineArt(stage), rng(30), ctx)
      expect(layer.vines.length).toBe(6)
      for (const v of layer.vines) {
        const size = `${w}x${h}`
        const last = v.x.length - 1
        // Nasce fora da tela (ou colada na borda).
        expect(Math.min(v.x[0], w - v.x[0], v.y[0], h - v.y[0]), size).toBeLessThanOrEqual(1)
        // A ponta encosta na coroa.
        const tip = Math.hypot(v.x[last] - stage.cx, v.y[last] - stage.cy)
        expect(tip, size).toBeCloseTo(stage.R, 0)
        for (let k = 0; k <= last; k++) {
          expect(Math.hypot(v.x[k] - stage.cx, v.y[k] - stage.cy), size).toBeGreaterThan(
            stage.R * 0.98
          )
          expect(v.x[k], size).toBeGreaterThanOrEqual(-40)
          expect(v.x[k], size).toBeLessThanOrEqual(w + 40)
          expect(v.y[k], size).toBeGreaterThanOrEqual(-40)
          expect(v.y[k], size).toBeLessThanOrEqual(h + 40)
        }
      }
    }
  })

  it('flores, gemas e folhas das vinhas ficam dentro da tela', () => {
    for (const [w, h] of SCREENS) {
      const stage = vinesStage(sceneLayout(w, h))
      const { ctx } = fakeCtx()
      const art = makeVineArt(stage)
      const layers = [
        makeBackLayer(stage, art, rng(31), ctx),
        makeMainLayer(stage, art, rng(30), ctx),
        makeWreathLayer(stage, art, rng(32), ctx)
      ]
      for (const layer of layers) {
        for (const a of anchors(layer)) {
          const size = `${w}x${h}`
          expect(a.x, size).toBeGreaterThanOrEqual(0)
          expect(a.x, size).toBeLessThanOrEqual(w)
          expect(a.y, size).toBeGreaterThanOrEqual(0)
          expect(a.y, size).toBeLessThanOrEqual(h)
        }
      }
    }
  })

  it('tudo brota antes do impacto, na ordem do crescimento', () => {
    const stage = vinesStage(sceneLayout(1280, 720))
    const { ctx } = fakeCtx()
    const layer = makeMainLayer(stage, makeVineArt(stage), rng(30), ctx)
    expect(layer.nodes.length).toBeGreaterThanOrEqual(6)
    expect(layer.blooms.length).toBeGreaterThanOrEqual(6)
    for (const a of [...layer.buds, ...layer.blooms, ...layer.nodes]) {
      expect(a.at).toBeGreaterThanOrEqual(0)
      expect(a.at).toBeLessThan(VINES_IMPACT_MS)
    }
    for (const b of layer.buds) {
      expect(b.at).toBeGreaterThanOrEqual(b.vine.from)
      expect(b.at).toBeLessThanOrEqual(b.vine.to)
    }
    const wreath = makeWreathLayer(stage, makeVineArt(stage), rng(32), ctx)
    expect(wreath.vines.length).toBe(2)
    for (const v of wreath.vines) expect(v.to).toBeLessThanOrEqual(VINES_IMPACT_MS)
  })
})

describe('cena do marco 30: desenho', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('nunca passa do orçamento de partículas', () => {
    stubSprites(fakeCtx().ctx)
    const { ctx } = fakeCtx()
    for (const budget of [0, 1, 5, 8, 40, 64, 80, 90]) {
      const scene = vinesScene(input(1280, 720, budget), rng(1), ctx)
      expect(scene.particles, String(budget)).toBeLessThanOrEqual(budget)
      for (const t of FRAMES) scene.draw(ctx, t)
    }
    expect(vinesScene(input(1280, 720, 50), rng(1), ctx).particles).toBe(50)
  })

  it('pré-desenha uma vez e só copia imagens por quadro', () => {
    const sprite = fakeCtx()
    stubSprites(sprite.ctx)
    const { ctx, calls } = fakeCtx()
    const scene = buildScene('vines', input(1280, 720), ctx)
    const before = { ...sprite.calls }
    // Folhas com nervuras, gemas com facetas, fundo e flores.
    expect(before.bezierCurveTo).toBeGreaterThan(0)
    expect(before.fill).toBeGreaterThan(8)
    for (const t of FRAMES) scene.draw(ctx, t)
    expect(sprite.calls).toEqual(before)
    expect(calls.drawImage).toBeGreaterThan(100)
    // Corpo das vinhas e nervuras, ondas do impacto, raios.
    expect(calls.lineTo).toBeGreaterThan(100)
    expect(calls.arc).toBeGreaterThan(0)
    // O desenho das vinhas é um caminho só, não um traço por segmento.
    expect(calls.stroke).toBeLessThan(calls.lineTo / 10)
  })

  it('desenha do começo ao fim em todos os tamanhos e devolve o contexto limpo', () => {
    for (const [w, h] of SCREENS) {
      stubSprites(fakeCtx().ctx)
      const { ctx } = fakeCtx()
      const scene = vinesScene(input(w, h), rng(2), ctx)
      for (let t = 0; t <= 3400; t += 170) scene.draw(ctx, t)
      expect(ctx.globalAlpha).toBe(1)
      expect(ctx.globalCompositeOperation).toBe('source-over')
    }
  })

  it('é a mesma cena toda vez (semente)', () => {
    stubSprites(fakeCtx().ctx)
    const count = (): Record<string, number> => {
      const { ctx, calls } = fakeCtx()
      const scene = vinesScene(input(1280, 720), rng(9), ctx)
      for (const t of FRAMES) scene.draw(ctx, t)
      return calls
    }
    expect(count()).toEqual(count())
  })

  it('sem contexto 2D para o pré-desenho, desenha direto e não quebra', () => {
    stubSprites(null)
    const { ctx, calls } = fakeCtx()
    const scene = vinesScene(input(360, 740), rng(3), ctx)
    for (const t of FRAMES) scene.draw(ctx, t)
    expect(calls.bezierCurveTo).toBeGreaterThan(0)
    expect(calls.drawImage ?? 0).toBeGreaterThan(0) // os brilhos continuam em imagem
    scene.draw(ctx, 3400)
  })
})
