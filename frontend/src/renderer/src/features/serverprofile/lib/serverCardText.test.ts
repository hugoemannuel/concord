import { describe, expect, it } from 'vitest'
import { createdLabel } from './serverCardText'

describe('createdLabel', () => {
  it('mês e ano, em português', () => {
    expect(createdLabel('2026-03-15T12:00:00Z')).toBe('Criado em mar. de 2026')
  })
  it('sem data ou data ruim, nada', () => {
    expect(createdLabel(undefined)).toBeNull()
    expect(createdLabel('ontem')).toBeNull()
  })
})
