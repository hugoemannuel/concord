// Abre (ou cria) a DM com uma pessoa. Quem chama diz se a tela já trocou de
// pessoa (isCancelled) e recebe o resultado junto do id de quem foi pedido.

import { errorMessage } from '../../../shared/lib/errorMessage'

export interface OpenDmDeps {
  get: (userId: string) => Promise<{ id: string }>
  isCancelled: () => boolean
  onOpened: (userId: string, conversationId: string) => void
  onFailed: (userId: string, message: string) => void
}

export async function openDm(userId: string, deps: OpenDmDeps): Promise<void> {
  try {
    const conv = await deps.get(userId)
    if (deps.isCancelled()) return
    deps.onOpened(userId, conv.id)
  } catch (err) {
    if (deps.isCancelled()) return
    deps.onFailed(userId, errorMessage(err, 'Falha ao abrir conversa.'))
  }
}
