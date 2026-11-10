import { acceptCall } from '../api/calls'
import { useChatStore } from '../../chat/store/chatStore'
import { showToast } from '../../../shared/store/toastStore'
import { useIncomingCallStore } from '../store/incomingCallStore'

/**
 * Atende a DM que toca e espera o servidor registrar a entrada (e me tirar da
 * call em que eu estava). false = não deu (avisado) ou recusei nesse
 * meio-tempo (sai da chamada de novo: o call:decline pode ter chegado antes
 * do aceite).
 */
export async function acceptIncomingDm(callId: string): Promise<boolean> {
  const ringing = (): boolean => useIncomingCallStore.getState().call?.callId === callId
  try {
    await acceptCall(callId)
  } catch (err) {
    if (!ringing()) return false
    showToast.error(err instanceof Error ? err.message : 'Não foi possível entrar na chamada.')
    useIncomingCallStore.getState().clear()
    return false
  }
  if (ringing()) return true
  useChatStore.getState().sendEvent('call:leave', { call_id: callId })
  return false
}
