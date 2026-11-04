import { useSyncExternalStore } from 'react'
import { msUntilNextDay } from '../lib/messageDates'

/**
 * Relógio do "hoje" do chat: um timer só, compartilhado por todas as
 * mensagens da tela, que dispara na meia-noite. Com o chat aberto na virada,
 * "19:54" de hoje passa a "Ontem às 19:54" sem recarregar nada.
 */

let current = Date.now()
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

function schedule(): void {
  timer = setTimeout(() => {
    current = Date.now()
    listeners.forEach((l) => l())
    schedule()
  }, msUntilNextDay(new Date()))
}

const snapshot = (): number => current

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    // Quem volta depois de um tempo sem ninguém ouvindo recebe a hora de agora.
    current = Date.now()
    schedule()
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) clearTimeout(timer)
  }
}

/** "Agora" no momento da última virada de dia (ou de quando a tela abriu). */
export function useDayClock(): Date {
  const stamp = useSyncExternalStore(subscribe, snapshot, snapshot)
  return new Date(stamp)
}
