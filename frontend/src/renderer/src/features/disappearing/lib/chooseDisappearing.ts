import { errorMessage } from '../../../shared/lib/errorMessage'
import type { DisappearingSeconds } from './disappearing'

/** Salva o prazo escolhido no menu; repetir o atual não faz nada, falha vai para `onError`. */
export async function chooseDisappearing(
  deps: {
    set: (id: string, seconds: DisappearingSeconds | null) => Promise<void>
    onError: (message: string) => void
  },
  conversationId: string,
  current: DisappearingSeconds | null,
  seconds: DisappearingSeconds | null
): Promise<void> {
  if (seconds === current) return
  try {
    await deps.set(conversationId, seconds)
  } catch (err) {
    deps.onError(errorMessage(err, 'Sem conexão com o servidor'))
  }
}
