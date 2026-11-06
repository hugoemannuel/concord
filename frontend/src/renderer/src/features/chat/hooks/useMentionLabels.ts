import { useMemo } from 'react'
import type { Message } from '../api/messages'
import { useAuthStore } from '../../auth/store/authStore'
import { mentionPeople } from '../lib/chatPaneView'
import {
  mentionLabels,
  type MentionLabels,
  type UserSuggestionInput
} from '../lib/mentions'

/** Nomes dos chips de menção da sala (recalcula a cada mensagem). */
export function useMentionLabels(
  mentionable: UserSuggestionInput[],
  messages: Message[],
  nicknames: Record<string, string> | undefined
): MentionLabels {
  const me = useAuthStore((s) => s.user)
  return useMemo(
    () => mentionLabels(mentionPeople(mentionable, me, messages, nicknames)),
    [mentionable, me, messages, nicknames]
  )
}
