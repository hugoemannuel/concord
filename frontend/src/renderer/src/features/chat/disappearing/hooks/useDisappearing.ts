import { useChatStore } from '../../store/chatStore'
import type { DisappearingSeconds } from '../lib/disappearing'

/** Prazo das mensagens temporárias da conversa (null = desativado ou sem conversa). */
export function useDisappearing(
  conversationId: string | null | undefined
): DisappearingSeconds | null {
  const seconds = useChatStore(
    (s) => s.conversations.find((c) => c.id === conversationId)?.disappearing_seconds
  )
  return (seconds as DisappearingSeconds | null | undefined) ?? null
}
