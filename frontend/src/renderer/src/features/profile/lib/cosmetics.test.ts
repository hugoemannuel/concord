import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  NAMEPLATE_MODES,
  decorationBox,
  decorationStyle,
  mediaLayers,
  resolveNameplateMode
} from './cosmetics'

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

  it('a moldura tem 1,2× o avatar, centralizada, com raio 8/16px e recorte circular no centro', () => {
    expect(decorationBox(32)).toEqual({ side: 38, offset: -3, borderRadius: 8, holeRadius: 16 })
    expect(decorationBox(80)).toEqual({ side: 96, offset: -8, borderRadius: 16, holeRadius: 40 })

    const small = decorationStyle(32)
    expect(small).toMatchObject({
      width: 38,
      height: 38,
      left: -3,
      top: -3,
      borderRadius: 8
    })
    expect(small.maskImage).toContain('radial-gradient(circle, transparent 15.5px, #000 16px)')
    expect(small.WebkitMaskImage).toBe(small.maskImage)

    const large = decorationStyle(80)
    expect(large.borderRadius).toBe(16)
    expect(large.maskImage).toContain('radial-gradient(circle, transparent 39.5px, #000 40px)')

    const mainCss = readFileSync(
      fileURLToPath(new URL('../../../assets/main.css', import.meta.url)),
      'utf8'
    )
    expect(mainCss).toMatch(/\[data-decoration\]\s*\{[\s\S]*?border-radius:\s*clamp\(8px,\s*18%,\s*16px\)/)
    expect(mainCss).toMatch(/\[data-decoration\]\s*\{[\s\S]*?radial-gradient\(\s*circle closest-side,\s*transparent calc\(83\.33% - 0\.5px\),\s*#000 83\.33%\s*\)/)
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
