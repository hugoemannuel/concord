// Desfazer/refazer do editor de tema. Arrastar o seletor de cor gera dezenas de
// mudanças por segundo: mudanças seguidas no mesmo campo (dentro de COALESCE_MS)
// viram um passo só. Puro e imutável.

export const COALESCE_MS = 600
export const HISTORY_LIMIT = 50

export interface History<T> {
  past: T[]
  present: T
  future: T[]
  /** Campo e hora da última mudança (para juntar as seguidas). */
  lastKey: string | null
  lastAt: number
}

export function startHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], lastKey: null, lastAt: 0 }
}

/** Grava `next`; junta com o passo anterior se for o mesmo campo logo em seguida. */
export function record<T>(h: History<T>, next: T, key: string, now: number): History<T> {
  const coalesce = key === h.lastKey && now - h.lastAt < COALESCE_MS
  const past = coalesce ? h.past : [...h.past, h.present].slice(-HISTORY_LIMIT)
  return { past, present: next, future: [], lastKey: key, lastAt: now }
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], lastKey: null, lastAt: 0 }
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), lastKey: null, lastAt: 0 }
}
