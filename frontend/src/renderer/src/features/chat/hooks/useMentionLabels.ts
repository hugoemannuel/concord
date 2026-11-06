import { useMemo, useState } from 'react'
import type { Message } from '../api/messages'
import { useAuthStore } from '../../auth/store/authStore'
import { mentionPeople } from '../lib/chatPaneView'
import {
  keepSameLabels,
  mentionLabels,
  type MentionLabels,
  type UserSuggestionInput
} from '../lib/mentions'

/**
 * Nomes dos chips de menção da sala. Recalcula a cada mensagem, mas devolve
 * o mesmo objeto enquanto os nomes não mudam: as linhas memoizadas não
 * redesenham por isso.
 */
export function useMentionLabels(
  mentionable: UserSuggestionInput[],
  messages: Message[],
  nicknames: Record<string, string> | undefined
): MentionLabels {
  const me = useAuthStore((s) => s.user)
  const fresh = useMemo(
    () => mentionLabels(mentionPeople(mentionable, me, messages, nicknames)),
    [mentionable, me, messages, nicknames]
  )
  // Guarda o último entregue (estado de render anterior, padrão da doc do React).
  const [kept, setKept] = useState(fresh)
  const labels = keepSameLabels(kept, fresh)
  if (labels !== kept) setKept(labels)
  return labels
}
