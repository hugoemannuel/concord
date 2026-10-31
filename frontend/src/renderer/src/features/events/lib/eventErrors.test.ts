import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../shared/api/client'
import { eventErrorMessage } from './eventErrors'

describe('eventErrorMessage', () => {
  it('mostra a mensagem em português que o servidor mandou (erro do pedido)', () => {
    const err = new ApiError(403, 'você não tem permissão para gerenciar eventos neste servidor', 'missing_permission')
    expect(eventErrorMessage(err)).toBe('você não tem permissão para gerenciar eventos neste servidor')
  })

  it('erro do servidor (5xx) vira uma mensagem genérica', () => {
    expect(eventErrorMessage(new ApiError(500, 'failed to process event'))).toBe(
      'Não foi possível salvar. Tente de novo.'
    )
  })

  it('sem conexão e erros desconhecidos viram a mensagem genérica', () => {
    expect(eventErrorMessage(new ApiError(0, 'Sem conexão com o servidor'))).toBe(
      'Não foi possível salvar. Tente de novo.'
    )
    expect(eventErrorMessage(new Error('boom'))).toBe('Não foi possível salvar. Tente de novo.')
    expect(eventErrorMessage('x')).toBe('Não foi possível salvar. Tente de novo.')
  })

  it('mensagem em inglês de erro do pedido não aparece para o usuário', () => {
    expect(eventErrorMessage(new ApiError(400, 'invalid body'))).toBe('Não foi possível salvar. Tente de novo.')
  })
})
