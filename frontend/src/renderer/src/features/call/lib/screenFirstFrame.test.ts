import { beforeEach, describe, expect, it } from 'vitest'
import { noteFirstFrame, noteWatchedScreens, takeFirstFrame } from './screenFirstFrame'

beforeEach(() => {
  noteWatchedScreens([], 0)
  takeFirstFrame('bia')
  takeFirstFrame('caio')
})

describe('screenFirstFrame', () => {
  it('do "assistir" ao primeiro quadro; leva uma vez só', () => {
    noteWatchedScreens(['bia'], 1000)
    noteFirstFrame('bia', 2250)
    expect(takeFirstFrame('bia')).toBe(1250)
    expect(takeFirstFrame('bia')).toBeNull()
  })
  it('quem já estava sendo assistido não recomeça a contar', () => {
    noteWatchedScreens(['bia'], 1000)
    noteWatchedScreens(['bia', 'caio'], 5000)
    noteFirstFrame('bia', 6000)
    noteFirstFrame('caio', 6000)
    expect(takeFirstFrame('bia')).toBe(5000)
    expect(takeFirstFrame('caio')).toBe(1000)
  })
  it('quadro sem "assistir" pendente (já medido, ou parou de assistir) não conta', () => {
    noteWatchedScreens(['bia'], 1000)
    noteWatchedScreens([], 1500)
    noteFirstFrame('bia', 2000)
    expect(takeFirstFrame('bia')).toBeNull()
    noteFirstFrame('caio', 2000)
    expect(takeFirstFrame('caio')).toBeNull()
  })
  it('acima de 60 s não vale (a live só apareceu na tela depois)', () => {
    noteWatchedScreens(['bia'], 0)
    noteFirstFrame('bia', 61_000)
    expect(takeFirstFrame('bia')).toBeNull()
  })
})
