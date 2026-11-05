import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../auth/store/authStore'
import type { ConversationSummary } from '../../chat/api/conversations'
import { conversationRoute, conversationTitle } from '../../chat/lib/conversations'
import { useChatStore } from '../../chat/store/chatStore'
import GroupIcon from '../../friends/components/GroupIcon'
import { useUserLook } from '../../profile/store/profileStore'
import Avatar from '../../../shared/ui/Avatar'
import { unreadRailDms } from '../lib/railDms'
import RailDmItem from './RailDmItem'

const SIZE = 48

/** Avatar de quem está do outro lado (ou o ícone do grupo), com o nome mais novo. */
function RailDmEntry({
  conv,
  unread,
  meId,
  onOpen
}: {
  conv: ConversationSummary
  unread: number
  meId: string | undefined
  onOpen: (conv: ConversationSummary) => void
}): React.JSX.Element {
  const other = conv.type === 'group' ? undefined : conv.other_user
  const name = useUserLook(other?.id, { name: conversationTitle(conv, meId) }).name
  return (
    <RailDmItem name={name} unread={unread} onOpen={() => onOpen(conv)}>
      {other ? (
        <Avatar
          userId={other.id}
          name={name}
          avatarUrl={other.avatar_url}
          size={SIZE}
          animate="hover"
        />
      ) : (
        <GroupIcon id={conv.id} iconUrl={conv.icon_url} size={SIZE} />
      )}
    </RailDmItem>
  )
}

/**
 * Logo abaixo do início, como no Discord: quem te mandou mensagem no privado
 * (DM ou grupo) e ainda não foi lida, com a quantidade. Some ao abrir a conversa.
 */
function RailDms({ onOpen }: { onOpen: () => void }): React.JSX.Element | null {
  const navigate = useNavigate()
  const meId = useAuthStore((s) => s.user?.id)
  const conversations = useChatStore((s) => s.conversations)
  const unreadByRoom = useChatStore((s) => s.unreadByRoom)
  const entries = unreadRailDms(conversations, unreadByRoom)
  if (entries.length === 0) return null

  const open = (conv: ConversationSummary): void => {
    onOpen()
    navigate(conversationRoute(conv, meId))
  }

  return (
    <div role="group" aria-label="Mensagens diretas não lidas" className="flex flex-col items-center gap-2">
      {entries.map(({ conv, unread }) => (
        <RailDmEntry key={conv.id} conv={conv} unread={unread} meId={meId} onOpen={open} />
      ))}
    </div>
  )
}

export default RailDms
