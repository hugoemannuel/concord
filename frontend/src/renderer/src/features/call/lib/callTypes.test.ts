import { describe, expect, it } from 'vitest'
import { CallLockedError } from './callTypes'

describe('CallLockedError', () => {
  it('guarda o id da chamada e a mensagem padrão', () => {
    const err = new CallLockedError('c-123')
    expect(err.message).toBe('A sala está trancada.')
    expect(err.callId).toBe('c-123')
  })
})
