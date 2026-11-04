import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MILESTONE_KINDS, type MilestoneKind } from './levels'
import { buildScene, DRAWS_NUMBER, type SceneInput } from './milestoneScenes'

// Só o que a montagem usa: gradientes (as cenas de número precisam do DOM). As
// vinhas pré-desenham em canvas escondidos: sem contexto 2D, ficam sem imagem.
const gradient = { addColorStop: (): void => {} }
const ctx = {
  createLinearGradient: () => gradient,
  createRadialGradient: () => gradient
} as unknown as CanvasRenderingContext2D

const input = (budget: number): SceneInput => ({
  w: 1280,
  h: 720,
  level: 60,
  color: '#f87171',
  accent: '#b91c1c',
  colors: ['#f87171', '#ffffff', '#b91c1c'],
  budget,
  power: 0.6,
  durationMs: 3200,
  fontPx: 230,
  cx: 640,
  cy: 331
})

describe('cenas de marco: orçamento de partículas', () => {
  const kinds = MILESTONE_KINDS.filter((k) => !DRAWS_NUMBER.has(k)) as MilestoneKind[]

  beforeEach(() => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('nenhuma cena cria mais partículas que o budget (contagem real)', () => {
    for (const kind of kinds) {
      for (const budget of [8, 10, 40, 64, 80, 90]) {
        const scene = buildScene(kind, input(budget), ctx)
        expect(scene.particles, `${kind} com ${budget}`).toBeLessThanOrEqual(budget)
        expect(scene.particles).toBeGreaterThan(0)
      }
    }
  })
})
