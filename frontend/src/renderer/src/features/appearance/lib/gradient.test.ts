import { describe, expect, it } from 'vitest'
import { gradientCss } from './gradient'

describe('gradientCss', () => {
  it('uma parada é cor sólida (sem imagem)', () => {
    expect(gradientCss({ type: 'linear', angle: 90, stops: ['#ff0000'] })).toBeNull()
  })

  it('linear com o ângulo (360 vira 0) e radial vindo de cima', () => {
    expect(gradientCss({ type: 'linear', angle: 360, stops: ['#ff0000', '#ffffff'] })).toBe(
      'linear-gradient(0deg, #ff0000, #ffffff)'
    )
    expect(gradientCss({ type: 'radial', angle: 90, stops: ['#ff0000', '#000000', '#ffffff'] })).toBe(
      'radial-gradient(ellipse at top, #ff0000, #000000, #ffffff)'
    )
  })
})
