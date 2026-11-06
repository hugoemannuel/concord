import { describe, expect, it } from 'vitest'
import {
  formatVoiceTime,
  INTENSITY_CAPS,
  LEGENDARY_TIER,
  levelIntensity,
  levelPalette,
  levelPercent,
  levelTier,
  levelUpEffects,
  MAX_PARTICLES,
  MILESTONE_KINDS,
  milestoneFor,
  minutesToNext,
  nextMilestone
} from './levels'

describe('levelTier', () => {
  it('muda de faixa a cada 10 níveis', () => {
    expect(levelTier(1).name).toBe('Bronze')
    expect(levelTier(9).name).toBe('Bronze')
    expect(levelTier(10).name).toBe('Prata')
    expect(levelTier(25).name).toBe('Ouro')
    expect(levelTier(99).name).toBe('Celestial')
  })

  it('do 100 em diante é lendário, sem limite', () => {
    expect(levelTier(100)).toBe(LEGENDARY_TIER)
    expect(levelTier(4321)).toBe(LEGENDARY_TIER)
  })
})

describe('progresso', () => {
  it('percentual e minutos restantes', () => {
    expect(levelPercent(77, 155)).toBe(49)
    expect(levelPercent(0, 0)).toBe(0)
    expect(minutesToNext(150, 155)).toBe(1)
    expect(minutesToNext(0, 155)).toBe(16)
  })

  it('formata o tempo de voz', () => {
    expect(formatVoiceTime(45 * 60)).toBe('45 min')
    expect(formatVoiceTime(200 * 60)).toBe('3 h 20 min')
    expect(formatVoiceTime(12 * 3600)).toBe('12 h')
  })
})

const NUMERIC = [
  'power',
  'sparks',
  'orbit',
  'confetti',
  'stars',
  'durationMs',
  'burstScale',
  'radius',
  'glow',
  'shake',
  'colors',
  'milestoneParticles'
] as const

describe('levelIntensity (escala contínua)', () => {
  it('nada diminui de um nível para o seguinte, até bem depois do 100', () => {
    for (let level = 1; level < 2000; level++) {
      const cur = levelIntensity(level)
      const next = levelIntensity(level + 1)
      for (const key of NUMERIC)
        expect(next[key], `${key} no ${level + 1}`).toBeGreaterThanOrEqual(cur[key])
    }
  })

  it('cada subida é um pouco maior que a anterior (a força sobe sempre)', () => {
    for (let level = 1; level < 2000; level++) {
      expect(levelIntensity(level + 1).power).toBeGreaterThan(levelIntensity(level).power)
    }
    // Até o 100 dá para ver: a duração cresce a cada nível.
    for (let level = 1; level < 100; level++) {
      expect(levelIntensity(level + 1).durationMs).toBeGreaterThan(levelIntensity(level).durationMs)
    }
  })

  it('respeita os tetos em qualquer nível (inclusive absurdos)', () => {
    for (const level of [1, 50, 100, 101, 150, 500, 10_000, 1e9, Number.MAX_SAFE_INTEGER]) {
      const fx = levelIntensity(level)
      for (const key of NUMERIC) {
        expect(fx[key], `${key} no ${level}`).toBeLessThanOrEqual(INTENSITY_CAPS[key])
        expect(fx[key]).toBeGreaterThanOrEqual(0)
        expect(Number.isFinite(fx[key])).toBe(true)
      }
    }
  })

  it('nível inválido conta como 1', () => {
    for (const level of [0, -5, Number.NaN, Number.NEGATIVE_INFINITY]) {
      expect(levelIntensity(level)).toEqual(levelIntensity(1))
    }
  })

  it('pontos de referência', () => {
    const one = levelIntensity(1)
    expect(one.power).toBe(0)
    expect(one.sparks).toBe(8)
    expect(one.durationMs).toBe(3000)
    expect(one.burstScale).toBe(1)
    expect(one.shake).toBe(0)
    expect(one.colors).toBe(2)
    expect(one.orbit).toBe(0)
    expect(one.confetti).toBe(6)

    const fifty = levelIntensity(50)
    expect(fifty.power).toBeCloseTo(49 / 99)
    expect(fifty.orbit).toBeGreaterThan(0)
    expect(fifty.confetti).toBe(12)
    expect(fifty.shake).toBeGreaterThan(1.5)
    expect(fifty.shake).toBeLessThan(2.5)

    const hundred = levelIntensity(100)
    expect(hundred.power).toBe(1)
    expect(hundred.sparks).toBe(24)
    expect(hundred.orbit).toBe(10)
    expect(hundred.confetti).toBe(18)
    expect(hundred.stars).toBe(14)
    expect(hundred.durationMs).toBe(5200)
    expect(hundred.burstScale).toBe(1.7)
    expect(hundred.radius).toBe(280)
    expect(hundred.shake).toBe(4)
    expect(hundred.colors).toBe(6)
  })

  it('depois do 100 ainda cresce, devagar e sem passar do teto', () => {
    const h = levelIntensity(100)
    const two = levelIntensity(200)
    expect(two.power).toBeGreaterThan(h.power)
    expect(two.power).toBeLessThan(1.25)
    expect(two.durationMs).toBeGreaterThan(h.durationMs)
    expect(two.radius).toBeGreaterThan(h.radius)
    expect(two.durationMs - h.durationMs).toBeLessThan(h.durationMs - levelIntensity(1).durationMs)
  })

  it('treme só um pouco (no máximo alguns px)', () => {
    expect(INTENSITY_CAPS.shake).toBeLessThanOrEqual(6)
  })

  it('confete desde o 1 (pouco), órbita a partir do 40, estrelas no 100', () => {
    expect(levelIntensity(2).confetti).toBeLessThan(levelIntensity(60).confetti)
    expect(levelIntensity(39).orbit).toBe(0)
    expect(levelIntensity(40).orbit).toBeGreaterThan(0)
    expect(levelIntensity(99).stars).toBe(0)
    expect(levelIntensity(100).stars).toBeGreaterThan(0)
  })
})

describe('levelPalette', () => {
  it('começa na cor da faixa e ganha cores com o nível', () => {
    expect(levelPalette(5)).toHaveLength(2)
    expect(levelPalette(5)[0]).toBe(levelTier(5).color)
    expect(levelPalette(100)).toHaveLength(levelIntensity(100).colors)
    for (let level = 1; level < 300; level++) {
      const colors = levelPalette(level)
      expect(colors).toHaveLength(levelIntensity(level).colors)
      expect(new Set(colors).size).toBe(colors.length)
    }
  })
})

describe('marcos (a cada 10 níveis)', () => {
  it('cada marco de 10 a 100 tem a sua animação, todas diferentes', () => {
    const kinds = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((l) => milestoneFor(l)?.kind)
    expect(kinds).toEqual([
      'coins',
      'shockwave',
      'vines',
      'ripple',
      'crystals',
      'fire',
      'prism',
      'blackhole',
      'constellation',
      'legendary'
    ])
    expect(new Set(kinds).size).toBe(10)
    expect(MILESTONE_KINDS).toHaveLength(10)
  })

  it('marco tem o nível redondo, a faixa e dura de 2 a 4,5 s', () => {
    for (let level = 10; level <= 300; level += 10) {
      const m = milestoneFor(level)!
      expect(m.level).toBe(level)
      expect(m.tier).toBe(levelTier(level))
      expect(m.durationMs).toBeGreaterThanOrEqual(2000)
      expect(m.durationMs).toBeLessThanOrEqual(4500)
      expect(m.title.length).toBeGreaterThan(0)
    }
  })

  it('fora dos redondos não tem marco', () => {
    for (const level of [1, 9, 11, 15, 99, 101, 155]) expect(milestoneFor(level)).toBeNull()
  })

  it('depois do 100 os marcos voltam a girar; a cada 100, Lendário de novo', () => {
    expect(milestoneFor(110)?.kind).toBe('coins')
    expect(milestoneFor(150)?.kind).toBe('crystals')
    expect(milestoneFor(200)?.kind).toBe('legendary')
  })

  it('pulou vários níveis: toca o maior marco cruzado', () => {
    expect(milestoneFor(31, 28)?.level).toBe(30)
    expect(milestoneFor(45, 18)?.level).toBe(40)
    expect(milestoneFor(31, 30)).toBeNull()
  })

  it('próximo marco', () => {
    expect(nextMilestone(1)).toBe(10)
    expect(nextMilestone(37)).toBe(40)
    expect(nextMilestone(40)).toBe(50)
    expect(nextMilestone(99)).toBe(100)
    expect(nextMilestone(0)).toBe(10)
  })
})

describe('levelUpEffects', () => {
  const particles = (level: number, previous = level - 1): number => {
    const e = levelUpEffects(level, previous)
    return e.sparks + e.orbit + e.confetti + e.stars + e.milestoneParticles
  }

  it('usa a escala contínua', () => {
    for (const level of [5, 15, 35, 55, 75, 95, 125]) {
      const e = levelUpEffects(level)
      const i = levelIntensity(level)
      expect(e.sparks).toBe(i.sparks)
      expect(e.burstScale).toBe(i.burstScale)
      expect(e.shake).toBe(i.shake)
      expect(e.glow).toBe(i.glow)
      expect(e.radius).toBe(i.radius)
      expect(e.colors).toEqual(levelPalette(level))
      expect(e.milestone).toBeNull()
      expect(e.milestoneParticles).toBe(0)
      expect(e.durationMs).toBe(i.durationMs)
    }
  })

  it('efeitos que entram por faixa continuam somando', () => {
    const at = (level: number): ReturnType<typeof levelUpEffects> => levelUpEffects(level)
    expect(at(5).rays).toBe(false)
    expect(at(25).rays).toBe(true)
    expect(at(25).rollNumber).toBe(true)
    expect(at(45).bannerBorder).toBe(true)
    expect(at(65).tileGlow).toBe(true)
    expect(at(85).vignette).toBe(true)
    expect(at(85).emblem).toBe(true)
    expect(at(105).legendary).toBe(true)
    expect(at(99).legendary).toBe(false)
  })

  it('cada nível é pelo menos tão grande quanto o anterior', () => {
    for (let level = 2; level < 400; level++) {
      const prev = levelUpEffects(level - 1)
      const cur = levelUpEffects(level)
      expect(cur.sparks).toBeGreaterThanOrEqual(prev.sparks)
      expect(cur.burstScale).toBeGreaterThanOrEqual(prev.burstScale)
      expect(cur.radius).toBeGreaterThanOrEqual(prev.radius)
      expect(cur.shake).toBeGreaterThanOrEqual(prev.shake)
      expect(cur.glow).toBeGreaterThanOrEqual(prev.glow)
      expect(cur.stage).toBeGreaterThanOrEqual(prev.stage)
    }
  })

  it('marco: animação própria, jingle próprio e tempo para ela acabar', () => {
    const seen = new Set<string>()
    for (let level = 10; level <= 100; level += 10) {
      const e = levelUpEffects(level)
      expect(e.milestone?.level).toBe(level)
      expect(e.sound).toBe(`milestone-${e.milestone!.kind}`)
      seen.add(e.sound!)
      expect(e.durationMs).toBeGreaterThan(e.milestone!.durationMs)
      expect(e.milestoneParticles).toBeGreaterThan(0)
      // O marco é o show: sem confete da faixa e sem a tela lendária genérica.
      expect(e.confetti).toBe(0)
      expect(e.stars).toBe(0)
      expect(e.shockwave).toBe(true)
      expect(e.tierReveal).toBe(levelTier(level).name)
    }
    expect(seen.size).toBe(10)
  })

  it('marco mais alto tem mais partículas que o mais baixo', () => {
    expect(levelUpEffects(100).milestoneParticles).toBeGreaterThan(
      levelUpEffects(10).milestoneParticles
    )
  })

  it('sem marco: chime a partir do 40, como antes', () => {
    expect(levelUpEffects(5).sound).toBeNull()
    expect(levelUpEffects(45).sound).toBe('levelChime')
    expect(levelUpEffects(85).sound).toBe('levelChimeRich')
    expect(levelUpEffects(101).sound).toBe('levelFanfare')
  })

  it('sem faixa nova não tem revelação (110 continua Lendário)', () => {
    expect(levelUpEffects(110).tierReveal).toBeNull()
    expect(levelUpEffects(110).milestone?.kind).toBe('coins')
  })

  it('pulou vários níveis e cruzou a faixa: revela e toca o marco', () => {
    expect(levelUpEffects(21, 18).tierReveal).toBe('Ouro')
    expect(levelUpEffects(21, 18).milestone?.level).toBe(20)
    expect(levelUpEffects(21, 20).tierReveal).toBeNull()
    expect(levelUpEffects(21, 20).milestone).toBeNull()
  })

  it(`no máximo ${120} partículas por celebração, em qualquer nível`, () => {
    expect(MAX_PARTICLES).toBe(120)
    for (let level = 1; level <= 2000; level++) {
      expect(particles(level), `nível ${level}`).toBeLessThanOrEqual(MAX_PARTICLES)
    }
    expect(particles(1e9)).toBeLessThanOrEqual(MAX_PARTICLES)
    expect(particles(100)).toBeGreaterThan(particles(50))
    expect(particles(95)).toBeGreaterThan(particles(55))
  })
})
