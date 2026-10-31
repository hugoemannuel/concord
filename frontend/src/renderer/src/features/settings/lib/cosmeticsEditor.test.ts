import { describe, expect, it } from 'vitest'
import {
  hasAnimation,
  nameplateChoice,
  nameplateEffect,
  previewRows,
  radioStep
} from './cosmeticsEditor'

const gif = '/api/profile-media/a_x'
const png = '/api/profile-media/y'

describe('nameplateChoice', () => {
  it('Desligada e Usar o banner só trocam o modo', () => {
    expect(nameplateChoice('off', {})).toEqual({ kind: 'mode', mode: 'off' })
    expect(nameplateChoice('banner', {})).toEqual({ kind: 'mode', mode: 'banner' })
  })
  it('Imagem própria sem imagem guardada abre o arquivo', () => {
    expect(nameplateChoice('custom', { nameplate_mode: 'off' })).toEqual({ kind: 'pick' })
  })
  it('Imagem própria guardada (modo banner) volta a usá-la sem pedir arquivo', () => {
    expect(
      nameplateChoice('custom', { nameplate_mode: 'banner', nameplate_custom_url: png })
    ).toEqual({ kind: 'mode', mode: 'custom' })
  })
  it('Imagem própria já em uso: escolher de novo troca a imagem', () => {
    expect(
      nameplateChoice('custom', { nameplate_mode: 'custom', nameplate_custom_url: png })
    ).toEqual({ kind: 'pick' })
  })
})

describe('prévia', () => {
  it('hasAnimation só com GIF', () => {
    expect(hasAnimation(png, null, undefined)).toBe(false)
    expect(hasAnimation(png, gif)).toBe(true)
  })
  it('com GIF: Parada e Animando; sem GIF: só Parada', () => {
    expect(previewRows({ nameplate_url: png, avatar_decoration_url: gif })).toEqual([
      { label: 'Parada', animate: false },
      { label: 'Animando', animate: true }
    ])
    expect(previewRows({ nameplate_url: png })).toEqual([{ label: 'Parada', animate: false }])
  })
  it('o avatar GIF também conta (anima na prévia)', () => {
    expect(previewRows({ avatar_url: gif })).toHaveLength(2)
  })
})

describe('radioStep', () => {
  it('setas andam em volta; outras teclas não', () => {
    expect(radioStep(0, 'ArrowDown', 3)).toBe(1)
    expect(radioStep(2, 'ArrowRight', 3)).toBe(0)
    expect(radioStep(0, 'ArrowUp', 3)).toBe(2)
    expect(radioStep(1, 'ArrowLeft', 3)).toBe(0)
    expect(radioStep(1, 'Enter', 3)).toBeNull()
  })
})

describe('nameplateEffect', () => {
  it('pede o arquivo, troca o modo ou não faz nada (já está nele)', () => {
    expect(nameplateEffect('custom', { nameplate_mode: 'off' })).toBe('pick')
    expect(nameplateEffect('banner', { nameplate_mode: 'off' })).toBe('banner')
    expect(nameplateEffect('off', { nameplate_mode: 'off' })).toBeNull()
  })
})

describe('nameplateEffect sem sessão', () => {
  it('sem usuário trata como desligada', () => {
    expect(nameplateEffect('banner', null)).toBe('banner')
    expect(nameplateEffect('off', null)).toBeNull()
  })
})
