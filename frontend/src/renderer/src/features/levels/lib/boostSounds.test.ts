import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../call/lib/sounds', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../call/lib/sounds')>()),
  playNotes: vi.fn()
}))

import { BASE_VOLUME, peakVolume, playNotes } from '../../call/lib/sounds'
import { boostRank } from './boost'
import { BOOST_SOUNDS, playBoostCelebration, playBoostSound } from './boostSounds'

const STAGES = [1, 2, 3, 4, 5, 6, 7] as const
const PERCENT_OF_STAGE = [125, 150, 175, 200, 250, 300, 400]
const end = (stage: (typeof STAGES)[number]): number =>
  Math.max(...BOOST_SOUNDS[stage].map((n) => n.at + n.duration))

describe('BOOST_SOUNDS', () => {
  it('tem um som por rank', () => {
    for (const stage of STAGES) {
      expect(BOOST_SOUNDS[stage].length, `estágio ${stage}`).toBeGreaterThan(0)
    }
  })

  it('o som só cresce: cada rank dura mais que o anterior', () => {
    for (let i = 1; i < STAGES.length; i++) {
      expect(end(STAGES[i])).toBeGreaterThan(end(STAGES[i - 1]))
    }
  })

  it('fica abaixo das vozes: pico dentro do teto dos jingles de nível', () => {
    for (const stage of STAGES) {
      const peak = peakVolume(BOOST_SOUNDS[stage])
      expect(peak, `estágio ${stage}`).toBeGreaterThan(0)
      expect(peak, `estágio ${stage}`).toBeLessThanOrEqual(0.8 * BASE_VOLUME)
    }
  })

  it('cada som cabe na duração do banner do rank', () => {
    STAGES.forEach((stage, i) => {
      const rank = boostRank(PERCENT_OF_STAGE[i])!
      expect(end(stage) * 1000, `estágio ${stage}`).toBeLessThan(rank.durationMs)
    })
  })

  it('toda nota tem frequência, início e duração válidos', () => {
    for (const stage of STAGES) {
      for (const note of BOOST_SOUNDS[stage]) {
        expect(note.freq).toBeGreaterThan(0)
        expect(note.at).toBeGreaterThanOrEqual(0)
        expect(note.duration).toBeGreaterThan(0)
      }
    }
  })
})

describe('playBoostSound', () => {
  beforeEach(() => vi.mocked(playNotes).mockClear())

  it('toca as notas do estágio no grupo dos sons de nível (um corta o outro)', () => {
    playBoostSound(5)
    expect(playNotes).toHaveBeenCalledWith(BOOST_SOUNDS[5], { level: true })
  })
})

describe('playBoostCelebration', () => {
  beforeEach(() => vi.mocked(playNotes).mockClear())

  it('toca uma vez por celebração, mesmo se o efeito rodar duas vezes (StrictMode)', () => {
    playBoostCelebration(9001, 3)
    playBoostCelebration(9001, 3)
    expect(playNotes).toHaveBeenCalledTimes(1)
  })

  it('uma celebração nova toca de novo', () => {
    playBoostCelebration(9002, 1)
    playBoostCelebration(9003, 2)
    expect(playNotes).toHaveBeenCalledTimes(2)
    expect(playNotes).toHaveBeenLastCalledWith(BOOST_SOUNDS[2], { level: true })
  })
})
