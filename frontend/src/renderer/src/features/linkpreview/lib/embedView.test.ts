import { describe, expect, it } from 'vitest'
import { safeEmbedColor, youtubeEmbedSrc } from './embedView'

describe('safeEmbedColor', () => {
  it('aceita só #rgb e #rrggbb', () => {
    expect(safeEmbedColor('#e0218a')).toBe('#e0218a')
    expect(safeEmbedColor('#FFF')).toBe('#FFF')
    expect(safeEmbedColor('red')).toBeNull()
    expect(safeEmbedColor('#fff;background:url(x)')).toBeNull()
    expect(safeEmbedColor(undefined)).toBeNull()
  })
})

describe('youtubeEmbedSrc', () => {
  it('monta o player do youtube-nocookie tocando', () => {
    expect(youtubeEmbedSrc('dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1')
  })
  it('id fora da forma do YouTube não vira player', () => {
    expect(youtubeEmbedSrc('curto')).toBeNull()
    expect(youtubeEmbedSrc('dQw4w9WgXc"/')).toBeNull()
    expect(youtubeEmbedSrc(undefined)).toBeNull()
  })
})

