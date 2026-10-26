import { describe, expect, it } from 'vitest'
import { formatInviteCount, inviteErrorMessage } from './invitePreview'
import { NO_CONNECTION_MESSAGE } from './loginError'

// Mesmo formato do ApiError (status + code), sem importar o client.
function apiError(status: number, code?: string): Error & { status: number; code?: string } {
  return Object.assign(new Error('x'), { status, code })
}

describe('formatInviteCount', () => {
  it('número em pt-BR, singular e plural', () => {
    expect(formatInviteCount(1, 'membro', 'membros')).toBe('1 membro')
    expect(formatInviteCount(0, 'membro', 'membros')).toBe('0 membros')
    expect(formatInviteCount(54301, 'membro', 'membros')).toBe('54.301 membros')
    expect(formatInviteCount(7129, 'online', 'online')).toBe('7.129 online')
  })
})

describe('inviteErrorMessage', () => {
  it('decide pelo status, não pelo texto do backend', () => {
    expect(inviteErrorMessage(apiError(404))).toBe('Este convite é inválido ou expirou.')
    expect(inviteErrorMessage(apiError(403, 'banned'))).toBe('Você foi banido deste servidor.')
    expect(inviteErrorMessage(apiError(403, 'email_not_verified'))).toBe(
      'Confirme seu e-mail para entrar no servidor.'
    )
    expect(inviteErrorMessage(apiError(429))).toBe(
      'Muitas tentativas. Espere um pouco e tente de novo.'
    )
    expect(inviteErrorMessage(apiError(500))).toBe('Erro no servidor. Tente de novo em instantes.')
    expect(inviteErrorMessage(new Error('?'))).toBe('Não foi possível abrir o convite.')
    expect(inviteErrorMessage(new TypeError('Failed to fetch'))).toBe(NO_CONNECTION_MESSAGE)
  })
})
