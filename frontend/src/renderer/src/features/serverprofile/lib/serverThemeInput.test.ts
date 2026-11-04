import { describe, expect, it } from 'vitest'
import { STARTERS } from '../../appearance/lib/starters'
import { serverThemeInput } from './serverThemeInput'

describe('serverThemeInput', () => {
  it('sem ponto de partida nem imagem, sem fundo', () => {
    expect(serverThemeInput({ starter: '', image: '', dim: 50 })).toBeNull()
    expect(serverThemeInput(undefined)).toBeNull()
  })
  it('o ponto de partida do app', () => {
    const input = serverThemeInput({ starter: 'oceano', image: '', dim: 50 })
    expect(input?.accent).toBe(STARTERS.find((s) => s.id === 'oceano')?.input.accent)
    expect(input?.image).toBe('')
  })
  it('a imagem por cima do tema escuro, com o escurecimento escolhido', () => {
    const input = serverThemeInput({ starter: '', image: '/api/server-profile-images/x', dim: 70 })
    expect(input?.image).toBe('/api/server-profile-images/x')
    expect(input?.imageDim).toBe(70)
    expect(input?.background).toBe('#1a1a1e')
  })
  it('ponto de partida que este app não conhece, sem imagem: sem fundo', () => {
    expect(serverThemeInput({ starter: 'de-uma-versao-nova', image: '', dim: 50 })).toBeNull()
  })
})
