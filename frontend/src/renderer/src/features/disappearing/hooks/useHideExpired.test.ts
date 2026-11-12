import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message } from '../../chat/api/messages'

// Sem DOM nem testing-library no projeto: um mini React que roda o hook de
// forma síncrona (useSyncExternalStore e useMemo), o bastante para o relógio.
const h = vi.hoisted(() => ({
  has: false,
  unsub: (() => {}) as () => void,
  rerender: () => {}
}))
vi.mock('react', () => ({
  useSyncExternalStore: (subscribe: (cb: () => void) => () => void, getSnapshot: () => unknown) => {
    if (!h.has) {
      h.has = true
      h.unsub = subscribe(() => h.rerender())
    }
    return getSnapshot()
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
  afterEach(() => {
    h.unsub()
    vi.useRealTimers()
  })

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
