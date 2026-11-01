import { describe, expect, it } from 'vitest'
import { addStop, removeStop, suggestedStop, withAngle, withMode, withStop } from './fillEditor'
import { PRESET_SEEDS } from './presetSeeds'

const BASE = PRESET_SEEDS['discord-dark']

describe('fillEditor', () => {
  it('liga o degradê com uma cor sugerida e volta ao sólido', () => {
    const linear = withMode(BASE, 'background', 'linear')
    expect(linear.background).toEqual({ type: 'linear', angle: 135, colors: [suggestedStop(BASE, 'background')] })
    const radial = withMode({ ...BASE, gradients: linear }, 'background', 'radial')
    expect(radial.background?.type).toBe('radial')
    expect(radial.background?.colors).toEqual(linear.background?.colors)
    expect(withMode({ ...BASE, gradients: linear }, 'background', 'solid')).toEqual({})
  })

  it('sugestão: matiz vizinho no destaque; toque do destaque nos fundos', () => {
    expect(suggestedStop(BASE, 'accent')).not.toBe(BASE.accent)
    expect(suggestedStop(BASE, 'card')).not.toBe(BASE.card)
  })

  it('cores: troca, acrescenta até 2 e tira até sobrar 1', () => {
    let input = { ...BASE, gradients: withMode(BASE, 'accent', 'linear') }
    input = { ...input, gradients: withStop(input, 'accent', 0, '#ff0000') }
    expect(input.gradients.accent?.colors).toEqual(['#ff0000'])
    input = { ...input, gradients: addStop(input, 'accent') }
    expect(input.gradients.accent?.colors).toHaveLength(2)
    expect(addStop(input, 'accent')).toBe(input.gradients)
    input = { ...input, gradients: removeStop(input, 'accent') }
    expect(input.gradients.accent?.colors).toEqual(['#ff0000'])
    expect(removeStop(input, 'accent')).toBe(input.gradients)
  })

  it('ângulo; sem degradê nada muda', () => {
    const input = { ...BASE, gradients: withMode(BASE, 'sidebar', 'linear') }
    expect(withAngle(input, 'sidebar', 90).sidebar?.angle).toBe(90)
    expect(withAngle(BASE, 'sidebar', 90)).toBe(BASE.gradients)
    expect(withStop(BASE, 'sidebar', 0, '#000000')).toBe(BASE.gradients)
    expect(addStop(BASE, 'sidebar')).toBe(BASE.gradients)
    expect(removeStop(BASE, 'sidebar')).toBe(BASE.gradients)
  })
})
