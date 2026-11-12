export interface Clock {
  subscribe: (onTick: () => void) => () => void
  getSnapshot: () => number
}

interface Timers {
  setInterval: (fn: () => void, ms: number) => unknown
  clearInterval: (id: unknown) => void
}

const realTimers: Timers = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id as number)
}

/**
 * Relógio compartilhado: um único intervalo para todos os assinantes. Começa
 * com o primeiro e para com o último. O valor só muda a cada tick (e ao
 * começar), então o snapshot é estável entre eles.
 */
export function createClock(
  ms: number,
  now: () => number = Date.now,
  timers: Timers = realTimers
): Clock {
  const listeners = new Set<() => void>()
  let value = now()
  let id: unknown = null
  const tick = (): void => {
    value = now()
    listeners.forEach((l) => l())
  }
  return {
    getSnapshot: () => value,
    subscribe: (onTick) => {
      if (listeners.size === 0) {
        value = now()
        id = timers.setInterval(tick, ms)
      }
      listeners.add(onTick)
      return () => {
        listeners.delete(onTick)
        if (listeners.size === 0) {
          timers.clearInterval(id)
          id = null
        }
      }
    }
  }
}

const clocks = new Map<number, Clock>()

/** O relógio compartilhado daquele intervalo. */
export function clockFor(ms: number): Clock {
  let c = clocks.get(ms)
  if (!c) {
    c = createClock(ms)
    clocks.set(ms, c)
  }
  return c
}
