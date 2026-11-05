import { describe, expect, it } from 'vitest'
import { PuzzleIcon, SoccerBallIcon } from '../../../shared/ui/icons'
import { pluginIcon } from './pluginIcon'

describe('pluginIcon', () => {
  it('bola vira a bola de futebol', () => {
    expect(pluginIcon('bola')).toBe(SoccerBallIcon)
  })

  it('quebra-cabeca, desconhecido e ausente viram o quebra-cabeça', () => {
    expect(pluginIcon('quebra-cabeca')).toBe(PuzzleIcon)
    expect(pluginIcon('xyz' as never)).toBe(PuzzleIcon)
    expect(pluginIcon(undefined)).toBe(PuzzleIcon)
  })
})
