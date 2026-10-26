import { describe, expect, it } from 'vitest'
import {
  isConnectionFailure,
  loginErrorMessage,
  NO_CONNECTION_MESSAGE,
  registerErrorMessage,
  TIMEOUT_MESSAGE
} from './loginError'

// Mesmo formato do ApiError (status + message), sem importar o client.
function apiError(
  status: number,
  message: string,
  code?: string
): Error & { status: number; code?: string } {
  return Object.assign(new Error(message), { status, code })
}

describe('loginErrorMessage', () => {
  it('401 vira credenciais incorretas, seja qual for o texto do backend', () => {
    expect(loginErrorMessage(apiError(401, 'invalid credentials'))).toBe(
      'E-mail/usuário ou senha incorretos.'
    )
    expect(loginErrorMessage(apiError(401, 'outra coisa'))).toBe(
      'E-mail/usuário ou senha incorretos.'
    )
  })

  it('400, 429 e 5xx têm texto próprio em português', () => {
    expect(loginErrorMessage(apiError(400, 'invalid request'))).toBe(
      'Não foi possível entrar. Confira os dados e tente de novo.'
    )
    expect(loginErrorMessage(apiError(429, 'too many requests'))).toBe(
      'Muitas tentativas. Espere um pouco e tente de novo.'
    )
    expect(loginErrorMessage(apiError(500, 'failed to generate token'))).toBe(
      'Erro no servidor. Tente de novo em instantes.'
    )
    expect(loginErrorMessage(apiError(503, 'Request failed'))).toBe(
      'Erro no servidor. Tente de novo em instantes.'
    )
  })

  it('rede fora vira sem conexão, com dica de DNS e antivírus', () => {
    expect(loginErrorMessage(apiError(0, 'x'))).toBe(NO_CONNECTION_MESSAGE)
    expect(loginErrorMessage(new TypeError('Failed to fetch'))).toBe(NO_CONNECTION_MESSAGE)
    expect(NO_CONNECTION_MESSAGE).toMatch(/DNS/)
  })

  it('tempo esgotado tem texto próprio, diferente de sem rede', () => {
    expect(loginErrorMessage(apiError(0, 'Request timed out', 'timeout'))).toBe(TIMEOUT_MESSAGE)
    expect(TIMEOUT_MESSAGE).not.toBe(NO_CONNECTION_MESSAGE)
  })

  it('qualquer outra coisa cai no genérico', () => {
    expect(loginErrorMessage(apiError(404, 'not found'))).toBe('Falha ao entrar.')
    expect(loginErrorMessage(new Error('boom'))).toBe('Falha ao entrar.')
    expect(loginErrorMessage('x')).toBe('Falha ao entrar.')
  })
})

describe('registerErrorMessage', () => {
  it('409 diz que usuário ou e-mail já está em uso, sem dizer qual', () => {
    expect(registerErrorMessage(apiError(409, 'username or email already in use'))).toBe(
      'Nome de usuário ou e-mail já em uso.'
    )
  })

  it('400, 5xx e sem conexão em português', () => {
    expect(registerErrorMessage(apiError(400, 'invalid email'))).toBe(
      'Confira os dados e tente de novo.'
    )
    expect(registerErrorMessage(apiError(500, 'failed to create user'))).toBe(
      'Erro no servidor. Tente de novo em instantes.'
    )
    expect(registerErrorMessage(apiError(0, 'Request timed out', 'timeout'))).toBe(TIMEOUT_MESSAGE)
    expect(registerErrorMessage(new TypeError('Failed to fetch'))).toBe(NO_CONNECTION_MESSAGE)
  })

  it('o resto cai no genérico do cadastro', () => {
    expect(registerErrorMessage(apiError(404, 'x'))).toBe('Falha ao criar conta.')
    expect(registerErrorMessage(new Error('boom'))).toBe('Falha ao criar conta.')
  })
})

describe('isConnectionFailure', () => {
  it('só vale quando o pedido nem teve resposta', () => {
    expect(isConnectionFailure(apiError(0, 'x'))).toBe(true)
    expect(isConnectionFailure(new TypeError('Failed to fetch'))).toBe(true)
    expect(isConnectionFailure(apiError(500, 'x'))).toBe(false)
    expect(isConnectionFailure(apiError(429, 'x'))).toBe(false)
    expect(isConnectionFailure(new Error('boom'))).toBe(false)
  })
})
