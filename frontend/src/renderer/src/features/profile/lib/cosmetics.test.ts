import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { NAMEPLATE_MODES, decorationBox, mediaLayers, resolveNameplateMode } from './cosmetics'

// Lê a lista de modos do Go: se alguém adicionar um modo só de um lado, quebra aqui.
function goModes(): string[] {
  const file = fileURLToPath(
    new URL('../../../../../../../backend/internal/cosmetics/cosmetics.go', import.meta.url)
  )
  const body = /var Modes = \[\]string\{([^}]*)\}/.exec(readFileSync(file, 'utf8'))?.[1] ?? ''
  return Array.from(body.matchAll(/"([a-z]+)"/g), (m) => m[1])
}

const API = 'http://host/api'

describe('faixa e moldura', () => {
  it('os modos da faixa são os do backend', () => {
    expect([...NAMEPLATE_MODES]).toEqual(goModes())
  })

  it('modo desconhecido vira desligada', () => {
    expect(resolveNameplateMode('x')).toBe('off')
    expect(resolveNameplateMode(undefined)).toBe('off')
    expect(resolveNameplateMode('banner')).toBe('banner')
  })

  it('a moldura tem 1,2× o avatar, centralizada', () => {
    expect(decorationBox(32)).toEqual({ side: 38, offset: -3 })
    expect(decorationBox(80)).toEqual({ side: 96, offset: -8 })
  })

  describe('mediaLayers', () => {
    const gif = '/api/profile-media/a_x'
    const png = '/api/profile-media/y'

    it('sem URL não desenha nada', () => {
      expect(mediaLayers(null, API, { animate: 'hover', active: true })).toEqual({
        still: null,
        moving: null
      })
    })
    it('GIF parado: só o /static, mesmo com hover desligado', () => {
      expect(mediaLayers(gif, API, { animate: 'hover', active: false })).toEqual({
        still: 'http://host/api/profile-media/a_x/static',
        moving: null
      })
    })
    it('GIF com hover: o parado e o animado por cima', () => {
      expect(mediaLayers(gif, API, { animate: 'hover', active: true })).toEqual({
        still: 'http://host/api/profile-media/a_x/static',
        moving: 'http://host/api/profile-media/a_x'
      })
    })
    it('always: o GIF direto, sem camada extra', () => {
      expect(mediaLayers(gif, API, { animate: 'always', active: false })).toEqual({
        still: 'http://host/api/profile-media/a_x',
        moving: null
      })
    })
    it('never: parado mesmo com hover', () => {
      expect(mediaLayers(gif, API, { animate: 'never', active: true }).moving).toBeNull()
    })
    it('imagem parada nunca ganha a camada animada', () => {
      expect(mediaLayers(png, API, { animate: 'hover', active: true })).toEqual({
        still: 'http://host/api/profile-media/y',
        moving: null
      })
    })
  })
})
