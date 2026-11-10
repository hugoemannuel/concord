import type { CallStateResponse } from '../api/calls'
import { useCallNoticeStore } from '../store/callNoticeStore'
import { useIncomingCallStore } from '../store/incomingCallStore'

interface Deps {
  getActiveDmCall: (conversationId: string) => Promise<CallStateResponse>
}

const text = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)

/**
 * Toque no push "está te ligando": o convite do WebSocket se perdeu (o app estava fechado), então pergunta ao
 * servidor se a chamada ainda toca. Se sim, abre a tela de atender; se não, mostra "Chamada perdida".
 */
export async function handleCallInviteTap(data: Record<string, unknown>, deps: Deps): Promise<void> {
  const callId = text(data.call_id)
  const conversationId = text(data.conversation_id)
  if (!callId || !conversationId) return
  const name = text(data.name) ?? 'alguém'
  const missed = (): void => useCallNoticeStore.getState().show(`Chamada perdida de ${name}`)
  try {
    const state = await deps.getActiveDmCall(conversationId)
    if (state.call?.id !== callId || state.call.status !== 'ringing') return missed()
    const who = state.participants.find((p) => p.user_id === state.call?.initiator_id)
    useIncomingCallStore.getState().ring({
      callId,
      conversationId,
      initiator: { id: state.call.initiator_id, username: who?.username ?? '', display_name: who?.display_name || name, avatar_url: who?.avatar_url ?? null }
    })
  } catch {
    missed()
  }
}
