import { create } from 'zustand'
import { sendCallInvites, type InviteResult } from '../api/callInvites'
import { INVITE_COPY } from '../lib/callInviteCopy'
import { chunk } from '../lib/invitePeople'

/** Limite do servidor por requisição (maxInviteesPerRequest no backend). */
const BATCH = 20

// Envio dos convites de amigos para a call (a janela "Convidar amigos"). Fica
// fora do callStore de propósito.

export type SendPhase = 'idle' | 'loading' | 'ok' | 'error'

interface CallInviteState {
  phase: SendPhase
  results: InviteResult[]
  error: string | null
  send: (callId: string, userIds: string[]) => Promise<void>
  resetSend: () => void
}

export const useCallInviteStore = create<CallInviteState>()((set) => ({
  phase: 'idle',
  results: [],
  error: null,
  send: async (callId, userIds) => {
    set({ phase: 'loading', error: null, results: [] })
    try {
      // "Selecionar todos" pode passar do limite: manda em lotes, um depois do outro.
      const results: InviteResult[] = []
      for (const batch of chunk(userIds, BATCH)) {
        results.push(...(await sendCallInvites(callId, batch)))
      }
      set({ phase: 'ok', results })
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : INVITE_COPY.requestFailed
      set({ phase: 'error', error: message })
    }
  },
  resetSend: () => set({ phase: 'idle', results: [], error: null })
}))
