import { afterEach, describe, expect, it, vi } from 'vitest'
import { JAGUAR_COLORS, JAGUAR_LEVEL, jaguarHead, jaguarScene } from './jaguarScene'
import { levelUpEffects, MAX_PARTICLES } from './levels'
import type { SceneInput } from './milestoneScenes'
import { rng } from './sceneKit'
import { buildScreenScene, sceneLayout, screenSceneFor } from './screenScene'

/** Contexto de canvas que só conta as chamadas (o teste roda sem DOM). */
function fakeCtx(): { ctx: CanvasRenderingContext2D; calls: Record<string, number> } {
  const calls: Record<string, number> = {}
  const gradient = { addColorStop: (): void => {} }
  const target: Record<string, unknown> = {}
  const ctx = new Proxy(target, {
    get: (t, key: string) =>
      key in t
        ? t[key]
        : (): unknown => {
            calls[key] = (calls[key] ?? 0) + 1
            return gradient
          },
    set: (t, key: string, value) => {
      t[key] = value
      return true
    }
  }) as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

const input = (w: number, h: number, budget = 45): SceneInput => ({
  ...sceneLayout(w, h),
  level: 14,
  color: '#f0b54a',
  accent: '#7a3e0a',
  colors: JAGUAR_COLORS,
  budget,
  power: 0.13,
  durationMs: 3200
})

/** O canvas escondido onde a cabeça da onça é pré-desenhada (null: sem contexto 2D). */
function stubSprite(sprite: CanvasRenderingContext2D | null): void {
  vi.stubGlobal('document', {
    createElement: () => ({ width: 0, height: 0, getContext: () => sprite })
  })
}

const FRAMES = [0, 300, 700, 1000, 1250, 1500, 2000, 2600, 3100, 3199]

describe('escolha da cena do nível 14 (onça-pintada)', () => {
  it('subir para o 14 toca a cena da onça, com o título padrão', () => {
    expect(JAGUAR_LEVEL).toBe(14)
    const scene = screenSceneFor(14, 13)!
    expect(scene.kind).toBe('jaguar')
    expect(scene.level).toBe(14)
    expect(scene.numberText).toBe('14')
    // Sem texto novo: o mesmo "Nível N" da cena do 24.
    expect(scene.label).toBe('Nível 14')
    expect(scene.colors).toEqual(JAGUAR_COLORS)
    expect(scene.gradient).toContain('#f0b54a')
    expect(scene.shine).toBe(true)
    expect(scene.crown).toBe(false)
    expect(scene.drawsNumber).toBe(false)
  })

  it('pulando do 9 para o 14, a onça ganha do marco 10', () => {
    expect(screenSceneFor(14, 9)?.kind).toBe('jaguar')
  })

  it('os vizinhos e as outras cenas não mudam', () => {
    expect(screenSceneFor(14, 14)).toBeNull()
    expect(screenSceneFor(15, 14)).toBeNull()
    expect(screenSceneFor(10, 9)?.kind).toBe('coins')
    expect(screenSceneFor(24, 23)?.kind).toBe('pride')
    // Pulando do 13 para o 24, quem toca é a do 24.
    expect(screenSceneFor(24, 13)?.kind).toBe('pride')
  })

  it('tem o esqueleto das outras e cabe no orçamento de partículas', () => {
    const scene = screenSceneFor(14, 13)!
    const fx = levelUpEffects(14, 13)
    expect(scene.durationMs).toBeGreaterThanOrEqual(2600)
    // A celebração do 14 dura fx.durationMs: a cena acaba antes dela.
    expect(scene.durationMs).toBeLessThanOrEqual(fx.durationMs)
    expect(scene.titleAt).toBeGreaterThan(scene.impactMs)
    expect(scene.titleAt).toBeLessThan(scene.durationMs)
    const others = fx.sparks + fx.orbit + fx.confetti + fx.stars
    expect(scene.budget).toBeGreaterThan(20)
    expect(scene.budget + others).toBeLessThanOrEqual(MAX_PARTICLES)
  })
})

describe('cena do nível 14 (onça-pintada)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('nunca cria mais partículas que o orçamento', () => {
    stubSprite(fakeCtx().ctx)
    for (const budget of [0, 5, 40, 80]) {
      const scene = jaguarScene(input(1280, 720, budget), rng(1))
      expect(scene.particles).toBeLessThanOrEqual(budget)
    }
    expect(jaguarScene(input(1280, 720, 45), rng(1)).particles).toBe(45)
  })

  it('a cabeça cabe na tela, acima do número, do celular ao monitor largo', () => {
    for (const [w, h] of [
      [360, 740],
      [768, 1024],
      [800, 400],
      [1280, 720],
      [2560, 1080]
    ]) {
      const l = sceneLayout(w, h)
      const head = jaguarHead(l)
      expect(head.x).toBe(w / 2)
      // As orelhas vão até ~1,05 raio acima do centro; o queixo, 0,9 abaixo.
      expect(head.y - head.r * 1.05, `${w}x${h}`).toBeGreaterThan(0)
      expect(head.y + head.r * 0.9, `${w}x${h}`).toBeLessThan(l.cy - l.fontPx * 0.3)
      expect(head.r, `${w}x${h}`).toBeGreaterThan(30)
    }
  })

  it('pré-desenha a cabeça com as rosetas uma vez e só copia a imagem por quadro', () => {
    const sprite = fakeCtx()
    stubSprite(sprite.ctx)
    const { ctx, calls } = fakeCtx()
    const scene = buildScreenScene('jaguar', input(1280, 720), ctx)
    const spriteArcs = sprite.calls.arc
    // Rosetas: anel quebrado em 4 + o miolo + a pinta no meio.
    expect(spriteArcs).toBeGreaterThanOrEqual(6 * 6)
    expect(sprite.calls.bezierCurveTo).toBeGreaterThan(0)
    for (const t of FRAMES) scene.draw(ctx, t)
    expect(sprite.calls.arc).toBe(spriteArcs)
    expect(calls.drawImage).toBeGreaterThan(0)
    // Olhos (amêndoas), boca aberta no rugido, ondas e folhas.
    expect(calls.quadraticCurveTo).toBeGreaterThan(0)
    expect(calls.ellipse).toBeGreaterThan(0)
    expect(calls.stroke).toBeGreaterThan(0)
    expect(calls.fill).toBeGreaterThan(0)
  })

  it('sem contexto 2D para o pré-desenho, desenha a cabeça direto e não quebra', () => {
    stubSprite(null)
    const { ctx, calls } = fakeCtx()
    const scene = jaguarScene(input(360, 740), rng(3))
    for (const t of FRAMES) scene.draw(ctx, t)
    expect(calls.bezierCurveTo).toBeGreaterThan(0)
    scene.draw(ctx, 3200)
  })
})
