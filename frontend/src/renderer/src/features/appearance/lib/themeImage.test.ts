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

describe('imagem do fundo do servidor', () => {
  const SERVER_IMAGE = '/api/server-profile-images/0b6d1c9e-6c1a-4f53-9f7d-1a2b3c4d5e6f'
  it('vale como a do tema; outro caminho, não', () => {
    expect(isThemeImage(SERVER_IMAGE)).toBe(true)
    expect(themeImageSrc(SERVER_IMAGE, 'http://host')).toBe(`http://host${SERVER_IMAGE}`)
    expect(isThemeImage('/api/profile-media/0b6d1c9e-6c1a-4f53-9f7d-1a2b3c4d5e6f')).toBe(false)
  })
})
