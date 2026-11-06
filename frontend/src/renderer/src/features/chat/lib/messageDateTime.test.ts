import { describe, expect, it } from 'vitest'
import { formatMessageDateTime } from './messageDateTime'

describe('formatMessageDateTime', () => {
  it('formata data e hora locais em português', () => {
    expect(formatMessageDateTime('2026-01-02T03:04:00')).toBe('02/01/2026, 03:04')
  })

  it('preserva o resultado nativo de uma data inválida', () => {
    expect(formatMessageDateTime('inválida')).toBe('Invalid Date')
  })
})
