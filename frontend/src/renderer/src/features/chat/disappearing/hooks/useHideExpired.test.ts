import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message } from '../../api/messages'

// Sem DOM nem testing-library no projeto: um mini React que roda o hook de
// forma síncrona (um useState, um useEffect e useMemo), o bastante para o relógio.
const h = vi.hoisted(() => ({
  state: undefined as unknown,
  has: false,
  rerender: () => {}
}))
vi.mock('react', () => ({
  useState: (init: () => unknown) => {
    if (!h.has) {
      h.state = init()
      h.has = true
    }
    return [
      h.state,
      (v: unknown) => {
        h.state = v
        h.rerender()
      }
    ]
  },
  useEffect: (fn: () => void) => {
    fn()
  },
  useMemo: (fn: () => unknown) => fn()
}))

import { useHideExpired } from './useHideExpired'

const msg = (id: string, expires_at?: string): Message => ({ id, expires_at }) as Message

describe('useHideExpired', () => {
  let result: Message[]
  const mount = (list: Message[]): void => {
    h.has = false
    h.rerender = () => {
      result = useHideExpired(list)
    }
    h.rerender()
  }
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-12T12:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('a mensagem some quando o relógio passa do prazo', () => {
    mount([msg('a'), msg('b', '2026-11-12T12:00:45Z')])
    expect(result.map((m) => m.id)).toEqual(['a', 'b'])
    vi.advanceTimersByTime(30_000)
    expect(result.map((m) => m.id)).toEqual(['a', 'b'])
    vi.advanceTimersByTime(30_000)
    expect(result.map((m) => m.id)).toEqual(['a'])
  })

  it('sem vencidas devolve o mesmo array', () => {
    const list = [msg('a')]
    mount(list)
    expect(result).toBe(list)
  })
})
