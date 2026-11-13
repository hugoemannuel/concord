import { useChatStore } from '../../chat/store/chatStore'
import { useServerStore } from '../../servers/store/serverStore'
import { roomDisappearing, type DisappearingSeconds } from '../lib/disappearing'

/** Prazo das mensagens temporárias da conversa (null = desativado ou sem conversa). */
export function useDisappearing(
  conversationId: string | null | undefined
): DisappearingSeconds | null {
  const seconds = useChatStore(
    (s) => s.conversations.find((c) => c.id === conversationId)?.disappearing_seconds
  )
  return (seconds as DisappearingSeconds | null | undefined) ?? null
}

/** Prazo das mensagens temporárias da sala (conversa ou canal); só leitura. */
export function useRoomDisappearing(room: string): DisappearingSeconds | null {
  const conversations = useChatStore((s) => s.conversations)
  const channels = useServerStore((s) => s.channels)
  return roomDisappearing(room, conversations, channels)
}
