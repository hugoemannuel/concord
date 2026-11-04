import { describe, expect, it } from 'vitest'
import { fromProfileEffect, toProfileEffect } from './backdropEditor'
import { DEFAULT_BACKDROP } from './themeInput'

describe('backdropEditor', () => {
  it('ida e volta pelo formato do efeito do perfil', () => {
    const b = {
      effect: 'rain',
      effectDensity: 80,
      effectSpeed: 20,
      effectColor: '#7cc4ff',
      effectSize: 70,
      effectDirection: 'left',
      effectOpacity: 40,
      effectPalette: 'duo',
      effectColor2: '#123456',
      effectArea: 'banner',
      effectGlow: 30
    }
    const p = toProfileEffect(b)
    expect(p).toMatchObject({
      effect: 'rain',
      effect_density: 80,
      effect_speed: 20,
      effect_color: '#7cc4ff',
      effect_size: 70,
      effect_direction: 'left',
      effect_opacity: 40,
      effect_palette: 'duo',
      effect_color2: '#123456',
      effect_area: 'banner',
      effect_glow: 30
    })
    expect(fromProfileEffect(p)).toEqual(b)
    expect(toProfileEffect(DEFAULT_BACKDROP).effect).toBe('none')
  })
})
