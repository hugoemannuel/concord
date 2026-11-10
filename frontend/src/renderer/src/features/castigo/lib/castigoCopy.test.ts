import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../shared/api/client'
import { castigoEffectsLabel, castigoErrorMessage, durationLabel, effectsSummary, voteSummary } from './castigoCopy'

describe('castigoCopy', () => {
  it('resume os efeitos', () => {
    expect(effectsSummary({ speak: true, connect: false, listen: false })).toBe('sem falar')
    expect(effectsSummary({ speak: true, connect: false, listen: true })).toBe(
      'sem falar e sem escutar'
    )
    expect(effectsSummary({ speak: true, connect: true, listen: true })).toBe(
      'sem falar, sem entrar na call e sem escutar'
    )
    expect(effectsSummary({ speak: false, connect: false, listen: false })).toBe('')
  })

  it('prazos', () => {
    expect(durationLabel(300)).toBe('5 min')
    expect(durationLabel(3600)).toBe('1 hora')
    expect(durationLabel(120)).toBe('2 min')
    expect(
      voteSummary({ effects: { speak: false, connect: true, listen: false }, duration: 600 })
    ).toBe('sem entrar na call · 10 min')
  })

  it('efeitos do registro de auditoria', () => {
    expect(castigoEffectsLabel('speak,listen')).toBe('Falar, Escutar')
    expect(castigoEffectsLabel('connect,lixo')).toBe('Entrar na call')
  })

  it('erros pelo código do servidor', () => {
    expect(castigoErrorMessage(new ApiError(409, 'x', 'vote_open'), 'falhou')).toBe(
      'Já tem uma votação de castigo nesta call.'
    )
    expect(castigoErrorMessage(new ApiError(500, 'x', 'internal'), 'falhou')).toBe('falhou')
    expect(castigoErrorMessage(new Error('x'), 'falhou')).toBe('falhou')
  })
})
