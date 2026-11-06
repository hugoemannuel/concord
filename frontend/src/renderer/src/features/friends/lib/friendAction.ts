import { errorMessage } from '../../../shared/lib/errorMessage'
import type { PendingFriendAction } from '../store/friendActionsStore'

/** O que remover/bloquear usa de fora (store de amigos e aviso). */
export interface FriendActionDeps {
  remove: (username: string) => Promise<void>
  block: (userId: string) => Promise<void>
  error: (message: string) => void
}

/** Executa a ação confirmada; em falha avisa e repassa o erro (o modal não fecha sozinho). */
export async function runFriendAction(
  pending: PendingFriendAction,
  deps: FriendActionDeps
): Promise<void> {
  try {
    if (pending.kind === 'remove') {
      await deps.remove(pending.username)
    } else {
      await deps.block(pending.userId)
    }
  } catch (err) {
    deps.error(errorMessage(err, 'Não foi possível concluir.'))
    throw err
  }
}
