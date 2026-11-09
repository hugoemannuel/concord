import { create } from 'zustand'

/**
 * Modo lento (issue #586): até quando cada sala está travada para mim, depois
 * de mandar uma mensagem ou de o servidor responder 429 "slowmode". Só para a
 * faixa e o botão; quem barra de verdade é o servidor.
 */
interface SlowmodeStoreState {
  /** room → horário (ms) em que posso mandar de novo. */
  until: Record<string, number>
  /** Trava a sala por `seconds` a partir de agora (não encurta uma espera maior). */
  block: (room: string, seconds: number, now?: number) => void
}

export const useSlowmodeStore = create<SlowmodeStoreState>((set, get) => ({
  until: {},
  block: (room, seconds, now = Date.now()) => {
    const next = now + seconds * 1000
    if ((get().until[room] ?? 0) >= next) return
    set({ until: { ...get().until, [room]: next } })
  }
}))
