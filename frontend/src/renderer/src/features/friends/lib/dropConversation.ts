import { errorMessage } from '../../../shared/lib/errorMessage'
import type { ConversationSummary } from '../../chat/api/conversations'

/** O que fechar a DM ou sair do grupo usa de fora (API, lista local, navegação e aviso). */
export interface DropConversationDeps {
  request: (conversationId: string) => Promise<unknown>
  removeLocal: (conversationId: string) => void
  isActive: (conv: ConversationSummary) => boolean
  /** Sai da conversa aberta (volta para Amigos). */
  leave: () => void
  error: (message: string) => void
}

/** Tira a conversa da lista lateral; se era a que estava aberta, sai dela. */
export async function dropConversation(
  deps: DropConversationDeps,
  conv: ConversationSummary,
  fallback: string
): Promise<void> {
  try {
    await deps.request(conv.id)
    deps.removeLocal(conv.id)
    if (deps.isActive(conv)) deps.leave()
  } catch (err) {
    deps.error(errorMessage(err, fallback))
  }
}
