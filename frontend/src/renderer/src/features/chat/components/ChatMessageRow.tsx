import { memo, useMemo } from 'react'
import type { MentionLabels } from '../lib/mentions'
import {
  bindRowHandlers,
  type MessageRowHandlers,
  type MessageRowListProps
} from '../lib/messageRows'
import MessageDayDivider from './MessageDayDivider'
import MessageItem from './MessageItem'

export interface ChatMessageRowProps extends MessageRowListProps {
  serverId?: string
  mentionLabels: MentionLabels
  canReact: boolean
  canModerate: boolean
  canDelete: boolean
  canPin: boolean
  /** O mesmo objeto para todas as linhas (useStableHandlers no ChatPane). */
  handlers: MessageRowHandlers
}

/**
 * Uma linha da lista do chat (divisor do dia + mensagem). Memoizada: só
 * redesenha quando a mensagem, a vizinha ou o estado dela mudam, nunca ao
 * digitar nem quando chega mensagem em outra linha.
 */
function ChatMessageRow({
  message,
  previous,
  handlers,
  ...row
}: ChatMessageRowProps): React.JSX.Element {
  const bound = useMemo(() => bindRowHandlers(handlers, message), [handlers, message])
  return (
    <>
      <MessageDayDivider message={message} previous={previous} />
      <MessageItem message={message} {...row} {...bound} />
    </>
  )
}

export default memo(ChatMessageRow)
