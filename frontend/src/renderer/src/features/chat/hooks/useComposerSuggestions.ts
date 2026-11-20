import { useId } from 'react'
import type { SlashSuggestion } from '../../music/lib/music'
import type { SuggestionMenu } from '../../../shared/lib/suggestionNav'
import { composerCommands } from '../lib/chatPaneView'
import type { UserSuggestionInput } from '../lib/mentions'
import type { MentionableRole } from '../lib/roleMentions'
import { useMentionMenu, type MentionMenu } from './useMentionMenu'
import { useSlashMenu, type SlashMenu } from './useSlashMenu'

interface Options {
  room: string
  draft: string
  setDraft: (text: string) => void
  /** Aviso de digitando. */
  onDraftChange: (text: string) => void
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  mentionable: UserSuggestionInput[]
  canMentionEveryone: boolean
  roles: MentionableRole[]
  isChannel: boolean
  canSendTTS: boolean
}

export interface ComposerSuggestions {
  mention: MentionMenu
  slash: SlashMenu
  /** A lista que o teclado do campo dirige agora. */
  active: SuggestionMenu
  /** Texto digitado no campo e a posição do cursor. */
  onInput: (text: string, caret: number) => void
}

const NO_COMMANDS: SlashSuggestion[] = []

/**
 * As duas listas de sugestões do campo de mensagem: @ (menções) e "/"
 * (Maestro em canal, /tts com a permissão). Com o @ aberto, o "/" não aparece.
 */
export function useComposerSuggestions(o: Options): ComposerSuggestions {
  const id = useId()
  const mention = useMentionMenu({
    room: o.room,
    listId: `${id}mencoes`,
    draft: o.draft,
    replaceDraft: (text) => {
      o.setDraft(text)
      o.onDraftChange(text)
    },
    inputRef: o.inputRef,
    mentionable: o.mentionable,
    canMentionEveryone: o.canMentionEveryone,
    roles: o.roles
  })
  const slash = useSlashMenu({
    room: o.room,
    listId: `${id}comandos`,
    draft: o.draft,
    commands: mention.open ? NO_COMMANDS : composerCommands(o.isChannel, o.canSendTTS),
    onPick: (text) => {
      o.setDraft(text)
      o.inputRef.current?.focus()
    }
  })
  return {
    mention,
    slash,
    active: mention.open ? mention : slash,
    onInput: (text, caret) => {
      mention.onInput(text, caret)
      slash.onInput()
    }
  }
}
