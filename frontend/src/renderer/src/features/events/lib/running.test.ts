import { describe, expect, it } from 'vitest'
import { isRunning } from './running'

const at = (minutes: number): string => new Date(Date.now() + minutes * 60_000).toISOString()

describe('isRunning', () => {
  it('antes da hora de começar não está em andamento', () => {
    expect(isRunning({ next_start_at: at(30) })).toBe(false)
  })

  it('a partir da hora de começar está em andamento', () => {
    expect(isRunning({ next_start_at: at(-1) })).toBe(true)
  })

  it('aceita o relógio de quem chama', () => {
    const start = '2026-12-01T20:00:00.000Z'
    expect(isRunning({ next_start_at: start }, new Date('2026-12-01T19:59:59Z'))).toBe(false)
    expect(isRunning({ next_start_at: start }, new Date('2026-12-01T20:00:00Z'))).toBe(true)
  })
})
