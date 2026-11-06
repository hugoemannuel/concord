import type { Message } from '../api/messages'
import { isGroupedWithPrevious } from './messageGrouping'

/** O que da tela do chat muda o desenho de uma linha (fora a própria mensagem). */
export interface RowViewState {
  highlightedId: string | null
  editingId: string | null
  savingEdit: boolean
}

/** Props da linha `i` que dependem da lista: valores simples ou a mesma referência. */
export interface MessageRowListProps {
  message: Message
  previous: Message | undefined
  grouped: boolean
  isHighlighted: boolean
  isEditing: boolean
  savingEdit: boolean
}

/**
 * Props da linha `i`. Linha que não mudou devolve as mesmas props (mesma
 * mensagem, mesma anterior, mesmos booleanos), e o memo dela pula o render.
 */
export function messageRowProps(
  messages: Message[],
  i: number,
  view: RowViewState
): MessageRowListProps {
  const message = messages[i]
  const previous = messages[i - 1]
  const isEditing = view.editingId === message.id
  return {
    message,
    previous,
    grouped: isGroupedWithPrevious(message, previous),
    isHighlighted: view.highlightedId === message.id,
    isEditing,
    savingEdit: view.savingEdit && isEditing
  }
}

/**
 * Ações de uma linha, recebendo a mensagem: um objeto só, fixo (useStableHandlers),
 * para todas as linhas. Cada linha amarra a sua mensagem em bindRowHandlers.
 */
export interface MessageRowHandlers {
  onReply: (message: Message) => void
  onReact: (message: Message, emoji: string) => void
  onJumpToMessage: (messageId: string) => void
  onDelete: (message: Message) => void
  onVote: (message: Message, answerIds: number[]) => Promise<void>
  onEndPoll: (message: Message) => Promise<void>
  onCopy: (message: Message) => void
  onStartEdit: (message: Message) => void
  onSaveEdit: (message: Message, draft: string) => void
  onCancelEdit: () => void
  onTogglePin: (message: Message) => void
}

/** As ações já com a mensagem da linha (o formato das props do MessageItem). */
export interface BoundRowHandlers {
  onReply: () => void
  onReact: (emoji: string) => void
  onJumpToMessage: (messageId: string) => void
  onDelete: () => void
  onVote: (answerIds: number[]) => Promise<void>
  onEndPoll: () => Promise<void>
  onCopy: () => void
  onStartEdit: () => void
  onSaveEdit: (draft: string) => void
  onCancelEdit: () => void
  onTogglePin: () => void
}

export function bindRowHandlers(h: MessageRowHandlers, message: Message): BoundRowHandlers {
  return {
    onReply: () => h.onReply(message),
    onReact: (emoji) => h.onReact(message, emoji),
    onJumpToMessage: h.onJumpToMessage,
    onDelete: () => h.onDelete(message),
    onVote: (answerIds) => h.onVote(message, answerIds),
    onEndPoll: () => h.onEndPoll(message),
    onCopy: () => h.onCopy(message),
    onStartEdit: () => h.onStartEdit(message),
    onSaveEdit: (draft) => h.onSaveEdit(message, draft),
    onCancelEdit: h.onCancelEdit,
    onTogglePin: () => h.onTogglePin(message)
  }
}
