import { describe, expect, it } from 'vitest'
import { ART_PRESETS, artBackground, resolveArt } from './serverArt'

describe('artBackground', () => {
  it('a imagem ganha do degradê e vem da origem da API', () => {
    const css = artBackground({ preset: 'azul', image: '/api/server-profile-images/x' }, 'http://host/api')
    expect(css.backgroundImage).toBe('url("http://host/api/server-profile-images/x")')
    expect(css.backgroundSize).toBe('cover')
  })

  it('no navegador a imagem fica na mesma origem', () => {
    const css = artBackground({ preset: '', image: '/api/server-profile-images/x' }, '/api')
    expect(css.backgroundImage).toBe('url("/api/server-profile-images/x")')
  })

  it('o degradê vem da paleta; desconhecido cai no padrão', () => {
    const azul = ART_PRESETS.find((p) => p.id === 'azul')
    expect(artBackground({ preset: 'azul', image: '' }, '/api').backgroundImage).toBe(azul?.css)
    expect(artBackground({ preset: 'url(evil)', image: '' }, '/api').backgroundImage).toBe(ART_PRESETS[0].css)
  })

  it('não deixa uma URL escapar do url() do CSS', () => {
    const css = artBackground({ preset: '', image: '/api/server-profile-images/x");color:red' }, '/api')
    expect(css.backgroundImage).toBe(ART_PRESETS[0].css)
  })
})

describe('resolveArt', () => {
  it('sem nada escolhido não há faixa', () => {
    expect(resolveArt({ preset: '', image: '' })).toBeNull()
    expect(resolveArt(undefined)).toBeNull()
  })
  it('com degradê ou imagem, há', () => {
    expect(resolveArt({ preset: 'azul', image: '' })).toEqual({ preset: 'azul', image: '' })
    expect(resolveArt({ preset: '', image: '/x' })).toEqual({ preset: '', image: '/x' })
  })
})
