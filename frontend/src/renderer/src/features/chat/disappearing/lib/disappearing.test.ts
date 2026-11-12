import { describe, expect, it } from 'vitest'
import {
  bannerText,
  conversationIdOfRoom,
  DISAPPEARING_OPTIONS,
  expiresInText,
  isExpired,
  shortLabel
} from './disappearing'

const NOW = Date.parse('2026-11-12T12:00:00Z')
const at = (ms: number): string => new Date(NOW + ms).toISOString()
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('disappearing', () => {
  it('opções com os rótulos aprovados', () => {
    expect(DISAPPEARING_OPTIONS.map((o) => [o.label, o.seconds])).toEqual([
      ['Desativadas', null],
      ['24 horas', 86400],
      ['7 dias', 604800],
      ['90 dias', 7776000]
    ])
  })

  it('rótulo curto e texto da faixa', () => {
    expect(shortLabel(86400)).toBe('24 h')
    expect(shortLabel(604800)).toBe('7 d')
    expect(shortLabel(7776000)).toBe('90 d')
    expect(bannerText(604800)).toBe('Mensagens temporárias ativadas: 7 dias')
    expect(bannerText(86400)).toBe('Mensagens temporárias ativadas: 24 horas')
  })

  it('"Some em X" arredonda para cima', () => {
    expect(expiresInText(at(3 * DAY), NOW)).toBe('Some em 3 dias')
    expect(expiresInText(at(2 * DAY + 1), NOW)).toBe('Some em 3 dias')
    expect(expiresInText(at(5 * HOUR), NOW)).toBe('Some em 5 horas')
    expect(expiresInText(at(4 * HOUR + MIN), NOW)).toBe('Some em 5 horas')
    expect(expiresInText(at(10 * MIN), NOW)).toBe('Some em 10 minutos')
    expect(expiresInText(at(9 * MIN + 1), NOW)).toBe('Some em 10 minutos')
    expect(expiresInText(at(1000), NOW)).toBe('Some em 1 minuto')
  })

  it('isExpired: igual a now já venceu; sem prazo nunca', () => {
    expect(isExpired({ expires_at: at(0) }, NOW)).toBe(true)
    expect(isExpired({ expires_at: at(-1) }, NOW)).toBe(true)
    expect(isExpired({ expires_at: at(1) }, NOW)).toBe(false)
    expect(isExpired({ expires_at: null }, NOW)).toBe(false)
    expect(isExpired({}, NOW)).toBe(false)
  })

  it('conversationIdOfRoom só para conversa', () => {
    expect(conversationIdOfRoom('conversation:abc')).toBe('abc')
    expect(conversationIdOfRoom('channel:abc')).toBeNull()
  })
})
