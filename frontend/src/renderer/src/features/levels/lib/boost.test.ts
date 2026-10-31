import { describe, expect, it } from 'vitest'
import {
  PREVIEW_BOOST_CALL_ID,
  boostLabel,
  boostRank,
  pickBoostBanner,
  shouldPlayBoostBanner
} from './boost'

const PERCENTS = [125, 150, 175, 200, 250, 300, 400]

describe('boostRank', () => {
  it('sem buff abaixo de 125%', () => {
    expect(boostRank(100)).toBeNull()
    expect(boostRank(124)).toBeNull()
    expect(boostRank(0)).toBeNull()
  })

  it('mapeia o percentual para o rank estilo DMC', () => {
    expect(boostRank(125)).toMatchObject({ letter: 'D', text: 'Dope!', stage: 1 })
    expect(boostRank(150)).toMatchObject({ letter: 'C', text: 'Crazy!', stage: 2 })
    expect(boostRank(175)).toMatchObject({ letter: 'B', text: 'Blast!', stage: 3 })
    expect(boostRank(200)).toMatchObject({ letter: 'A', text: 'Alright!', stage: 4 })
    expect(boostRank(250)).toMatchObject({ letter: 'S', text: 'Sweet!', stage: 5 })
    expect(boostRank(300)).toMatchObject({ letter: 'SS', text: 'Showtime!', stage: 6 })
    expect(boostRank(400)).toMatchObject({ letter: 'SSS', text: "Smokin' Sexy Style!", stage: 7 })
  })

  it('em cada degrau o limite de baixo é do rank e o de cima ainda é do anterior', () => {
    const edges: [number, string][] = [
      [149, 'D'],
      [150, 'C'],
      [174, 'C'],
      [175, 'B'],
      [199, 'B'],
      [200, 'A'],
      [249, 'A'],
      [250, 'S'],
      [299, 'S'],
      [300, 'SS'],
      [399, 'SS'],
      [400, 'SSS']
    ]
    for (const [percent, letter] of edges) {
      expect(boostRank(percent)?.letter, `${percent}%`).toBe(letter)
    }
  })

  it('percentuais acima do teto continuam em SSS', () => {
    expect(boostRank(500)?.letter).toBe('SSS')
  })

  it('cada rank tem letra, texto, cor e estágio próprios', () => {
    const ranks = PERCENTS.map((p) => boostRank(p)!)
    expect(ranks.map((r) => r.stage)).toEqual([1, 2, 3, 4, 5, 6, 7])
    for (const key of ['letter', 'text', 'color'] as const) {
      expect(new Set(ranks.map((r) => r[key])).size).toBe(7)
    }
  })

  it('os ranks novos (D, C, B) só têm o slam da letra', () => {
    for (const p of [125, 150, 175]) {
      expect(boostRank(p)).toMatchObject({
        sparks: 0,
        ring: false,
        edgeFlash: false,
        quake: false,
        screenFlash: false,
        glitch: false,
        aura: false,
        embers: 0
      })
    }
  })

  it('a animação só cresce com o rank', () => {
    const ranks = PERCENTS.map((p) => boostRank(p)!)
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i].durationMs).toBeGreaterThan(ranks[i - 1].durationMs)
      expect(ranks[i].sparks).toBeGreaterThanOrEqual(ranks[i - 1].sparks)
      expect(ranks[i].embers).toBeGreaterThanOrEqual(ranks[i - 1].embers)
      expect(ranks[i].shineMs).toBeLessThan(ranks[i - 1].shineMs)
    }
    expect(ranks.map((r) => r.durationMs)).toEqual([900, 1000, 1100, 1200, 1600, 2000, 2500])
    expect(ranks.map((r) => r.edgeFlash)).toEqual([false, false, false, false, true, true, true])
    expect(ranks.map((r) => r.ring)).toEqual([false, false, false, false, false, true, true])
    expect(ranks.map((r) => r.embers)).toEqual([0, 0, 0, 0, 0, 4, 7])
    for (const flag of ['screenFlash', 'quake', 'glitch', 'aura'] as const) {
      expect(ranks.map((r) => r[flag])).toEqual([false, false, false, false, false, false, true])
    }
  })

  it('o brilho da barra de A a SSS mantém os tempos de antes (2,0 s a 0,8 s)', () => {
    expect([200, 250, 300, 400].map((p) => boostRank(p)!.shineMs)).toEqual([2000, 1600, 1200, 800])
  })
})

describe('boostLabel', () => {
  it('formata o multiplicador', () => {
    expect(PERCENTS.map(boostLabel)).toEqual([
      'x1.25',
      'x1.5',
      'x1.75',
      'x2.0',
      'x2.5',
      'x3.0',
      'x4.0'
    ])
  })
})

describe('shouldPlayBoostBanner', () => {
  it('toca só na call do buff e sem mute/surdez', () => {
    expect(shouldPlayBoostBanner(false, 'c1', 'c1')).toBe(true)
    expect(shouldPlayBoostBanner(false, 'c1', 'c2')).toBe(false)
    expect(shouldPlayBoostBanner(false, 'c1', null)).toBe(false)
    expect(shouldPlayBoostBanner(true, 'c1', 'c1')).toBe(false)
  })

  it('a prévia de dev toca em qualquer lugar, menos pausado', () => {
    expect(shouldPlayBoostBanner(false, PREVIEW_BOOST_CALL_ID, null)).toBe(true)
    expect(shouldPlayBoostBanner(true, PREVIEW_BOOST_CALL_ID, null)).toBe(false)
  })
})

describe('pickBoostBanner', () => {
  const stored = { callId: 'c1', percent: 175, eligible: 4, key: 1 }

  it('devolve a celebração com o rank quando ela vale para mim', () => {
    const picked = pickBoostBanner(stored, false, 'c1')
    expect(picked?.celebration).toBe(stored)
    expect(picked?.rank.letter).toBe('B')
  })

  it('não devolve nada sem celebração, em outra call, mutado/surdo ou sem rank', () => {
    expect(pickBoostBanner(null, false, 'c1')).toBeNull()
    expect(pickBoostBanner(stored, false, 'c2')).toBeNull()
    expect(pickBoostBanner(stored, true, 'c1')).toBeNull()
    expect(pickBoostBanner({ ...stored, percent: 100 }, false, 'c1')).toBeNull()
  })
})
