import { describe, expect, it } from 'vitest'
import { fromProfileEffect, toProfileEffect } from './backdropEditor'
import { DEFAULT_BACKDROP } from './themeInput'

describe('backdropEditor', () => {
  it('ida e volta pelo formato do efeito do perfil', () => {
    const b = { effect: 'rain', effectDensity: 80, effectSpeed: 20, effectColor: '#7cc4ff' }
    const p = toProfileEffect(b)
    expect(p).toMatchObject({ effect: 'rain', effect_density: 80, effect_speed: 20, effect_color: '#7cc4ff' })
    expect(fromProfileEffect(p)).toEqual(b)
    expect(toProfileEffect(DEFAULT_BACKDROP).effect).toBe('none')
  })
})
