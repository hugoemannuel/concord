import { create } from 'zustand'
import type { CallUserInfo } from './callStore'

// A DM que está tocando para mim. Fica fora do callStore de propósito: ela toca
// por cima da call em que eu estiver (estilo Discord) e atender troca de call.

export interface IncomingCall {
  callId: string
  conversationId: string | null
  initiator: CallUserInfo
}

interface IncomingCallState {
  call: IncomingCall | null
  /** Começa a tocar; com outra chamada já tocando, fica a primeira. */
  ring: (call: IncomingCall) => void
  clear: () => void
}

export const useIncomingCallStore = create<IncomingCallState>()((set, get) => ({
  call: null,
  ring: (call) => {
    if (get().call) return
    set({ call })
  },
  clear: () => set({ call: null })
}))
