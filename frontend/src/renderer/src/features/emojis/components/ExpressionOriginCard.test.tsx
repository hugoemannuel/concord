import { describe, expect, it } from 'vitest'
import { originText } from './ExpressionOriginCard'

describe('originText', () => {
  it('mostra o nome do servidor', () => {
    expect(originText({ server_name: 'Alfa' })).toBe('de Alfa')
  })

  it('servidor privado não tem nome', () => {
    expect(originText({ private: true, server_name: 'Segredo' })).toBe('de um servidor privado')
  })

  it('sem origem conhecida não inventa', () => {
    expect(originText(undefined)).toBe('de outro servidor')
  })
})
