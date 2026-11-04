import { describe, expect, it } from 'vitest'
import { levelUpEffects, MAX_PARTICLES, MILESTONE_KINDS } from './levels'
import { PRIDE_COLORS } from './levelBadgeStyle'
import { BRAZIL_COLORS } from './brazilScene'
import { RED_STAR_COLORS } from './redStarScene'
import { BRAZIL_LEVEL, PRIDE_LEVEL, RED_STAR_LEVEL, screenSceneFor } from './screenScene'

describe('screenSceneFor (cena em tela cheia da sua subida)', () => {
  it('subir para o 24 toca a cena do arco-íris do orgulho', () => {
    expect(PRIDE_LEVEL).toBe(24)
    const scene = screenSceneFor(24, 23)!
    expect(scene.kind).toBe('pride')
    expect(scene.level).toBe(24)
    expect(scene.numberText).toBe('24')
    // Título padrão de subida, sem texto extra.
    expect(scene.label).toBe('Nível 24')
    for (const color of PRIDE_COLORS) expect(scene.gradient).toContain(color)
    expect(scene.colors).toEqual(PRIDE_COLORS)
    expect(scene.shine).toBe(true)
  })

  it('pulando do 19 para o 24, a cena do 24 ganha do marco 20', () => {
    expect(screenSceneFor(24, 19)?.kind).toBe('pride')
  })

  it('fora do 24 só os marcos têm cena', () => {
    expect(screenSceneFor(23, 22)).toBeNull()
    expect(screenSceneFor(25, 24)).toBeNull()
    expect(screenSceneFor(24, 24)).toBeNull()
    expect(screenSceneFor(20, 19)?.kind).toBe('shockwave')
  })

  it('os marcos continuam iguais (número, rótulo e lendário)', () => {
    for (const kind of MILESTONE_KINDS) expect(kind).not.toBe('pride')
    const shock = screenSceneFor(20, 19)!
    expect(shock.label).toBe('Marco 20 · Onda dourada')
    expect(shock.numberText).toBe('20')
    expect(shock.budget).toBe(levelUpEffects(20, 19).milestoneParticles)
    const legendary = screenSceneFor(100, 99)!
    expect(legendary.kind).toBe('legendary')
    expect(legendary.numberText).toBe('LENDÁRIO')
    expect(legendary.label).toBe('Nível 100')
    expect(legendary.crown).toBe(true)
    expect(screenSceneFor(80, 79)?.drawsNumber).toBe(false)
    expect(screenSceneFor(50, 49)?.drawsNumber).toBe(true)
  })

  it('a cena do 24 tem o esqueleto das outras e cabe no orçamento de partículas', () => {
    const scene = screenSceneFor(24, 23)!
    const fx = levelUpEffects(24, 23)
    expect(scene.durationMs).toBeGreaterThanOrEqual(2600)
    expect(scene.durationMs).toBeLessThanOrEqual(fx.durationMs)
    expect(scene.titleAt).toBeLessThan(scene.durationMs)
    expect(scene.impactMs).toBeLessThan(scene.durationMs)
    const others = fx.sparks + fx.orbit + fx.confetti + fx.stars
    expect(scene.budget).toBeGreaterThan(20)
    expect(scene.budget + others).toBeLessThanOrEqual(MAX_PARTICLES)
  })

  it('subir para o 13 toca a cena da estrela vermelha', () => {
    expect(RED_STAR_LEVEL).toBe(13)
    const scene = screenSceneFor(13, 12)!
    expect(scene.kind).toBe('redstar')
    expect(scene.level).toBe(13)
    expect(scene.numberText).toBe('13')
    expect(scene.label).toBe('Nível 13')
    expect(scene.colors).toEqual(RED_STAR_COLORS)
    expect(scene.color).toBe('#d50000')
    expect(scene.gradient).toContain('#ffd54f')
    expect(scene.drawsNumber).toBe(false)
  })

  it('pulando do 9 para o 13, a estrela vermelha ganha do marco 10', () => {
    expect(screenSceneFor(13, 9)?.kind).toBe('redstar')
    expect(screenSceneFor(13, 13)).toBeNull()
    expect(screenSceneFor(12, 11)).toBeNull()
    expect(screenSceneFor(15, 14)).toBeNull()
  })

  it('a cena do 13 tem o esqueleto das outras e cabe no orçamento de partículas', () => {
    const scene = screenSceneFor(13, 12)!
    const fx = levelUpEffects(13, 12)
    expect(scene.durationMs).toBeGreaterThanOrEqual(2600)
    expect(scene.durationMs).toBeLessThanOrEqual(fx.durationMs)
    expect(scene.titleAt).toBeLessThan(scene.durationMs)
    expect(scene.impactMs).toBeLessThan(scene.durationMs)
    const others = fx.sparks + fx.orbit + fx.confetti + fx.stars
    expect(scene.budget).toBeGreaterThan(20)
    expect(scene.budget + others).toBeLessThanOrEqual(MAX_PARTICLES)
  })

  it('subir para o 22 toca a cena da bandeira do Brasil', () => {
    expect(BRAZIL_LEVEL).toBe(22)
    const scene = screenSceneFor(22, 21)!
    expect(scene.kind).toBe('brazil')
    expect(scene.level).toBe(22)
    expect(scene.numberText).toBe('22')
    expect(scene.label).toBe('Nível 22')
    expect(scene.colors).toEqual(BRAZIL_COLORS)
    expect(scene.color).toBe('#009c3b')
    expect(scene.accent).toBe('#002776')
    expect(scene.drawsNumber).toBe(false)
    expect(screenSceneFor(22, 22)).toBeNull()
    expect(screenSceneFor(21, 20)).toBeNull()
    expect(screenSceneFor(23, 22)).toBeNull()
  })

  it('pulando do 19 para o 22, a bandeira ganha do marco 20', () => {
    expect(screenSceneFor(22, 19)?.kind).toBe('brazil')
  })

  it('a cena do 22 tem o esqueleto das outras e cabe no orçamento de partículas', () => {
    const scene = screenSceneFor(22, 21)!
    const fx = levelUpEffects(22, 21)
    expect(scene.durationMs).toBeGreaterThanOrEqual(2600)
    expect(scene.durationMs).toBeLessThanOrEqual(fx.durationMs)
    expect(scene.titleAt).toBeLessThan(scene.durationMs)
    expect(scene.impactMs).toBeLessThan(scene.durationMs)
    const others = fx.sparks + fx.orbit + fx.confetti + fx.stars
    expect(scene.budget).toBeGreaterThan(20)
    expect(scene.budget + others).toBeLessThanOrEqual(MAX_PARTICLES)
  })
})
