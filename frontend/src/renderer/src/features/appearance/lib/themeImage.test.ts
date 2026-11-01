import { describe, expect, it } from 'vitest'
import { imageOrigin, isThemeImage, themeImageSrc } from './themeImage'

const IMAGE = '/api/app-theme-images/0f8fad5b-d9cb-469f-a165-70867728950e'

describe('themeImage', () => {
  it('só aceita a imagem enviada pelo app', () => {
    expect(isThemeImage(IMAGE)).toBe(true)
    expect(isThemeImage(`${IMAGE}") ; x`)).toBe(false)
    expect(isThemeImage('https://exemplo.com/a.png')).toBe(false)
    expect(isThemeImage(42)).toBe(false)
  })

  it('monta o endereço com a origem do servidor (desktop) ou relativo (web)', () => {
    expect(imageOrigin('http://localhost:8080/api')).toBe('http://localhost:8080')
    expect(imageOrigin('/api')).toBe('')
    expect(themeImageSrc(IMAGE, 'https://s.exemplo')).toBe(`https://s.exemplo${IMAGE}`)
    expect(themeImageSrc('javascript:x', '')).toBe('')
  })
})
