import { FriendsIcon, PlusIcon } from '../../../shared/ui/icons'
import { DmListSkeleton } from '../../../shared/ui/skeleton/layouts'
import type { ConversationSummary } from '../../chat/api/conversations'
import { conversationTitle } from '../../chat/lib/conversations'
import ConfirmModal from './ConfirmModal'
import ConversationRow from './ConversationRow'

// Partes da barra de DMs/amigos (FriendsSidebar), separadas para cada uma ter
// só a sua regra de exibição.

/** Botão "Amigos" do topo, com o contador de pedidos recebidos. */
export function FriendsNavButton({
  pathname,
  incomingCount,
  onOpen
}: {
  pathname: string
  incomingCount: number
  onOpen: () => void
}): React.JSX.Element {
  const onFriendsPage = pathname === '/' || pathname === '/friends'
  return (
    <nav className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={onOpen}
        className={`flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-ds-md font-medium transition-colors ${
          onFriendsPage ? 'bg-fg/10 text-strong' : 'text-gray-400 hover:bg-fg/6 hover:text-gray-200'
        }`}
      >
        <span className="flex items-center gap-3">
          <FriendsIcon className="h-5 w-5" />
          Amigos
        </span>
        {incomingCount > 0 && (
          <span className="rounded-full bg-danger-strong px-1.5 text-[11px] font-bold text-white">
            {incomingCount}
          </span>
        )}
      </button>
    </nav>
  )
}

interface DirectMessagesListProps {
  conversations: ConversationSummary[]
  loaded: boolean
  unreadByRoom: Record<string, number>
  typingDms: string[]
  meId: string | undefined
  isActive: (conv: ConversationSummary) => boolean
  onCreate: () => void
  onClose: (conv: ConversationSummary) => void
}

/** "Mensagens diretas": cabeçalho com o botão de criar e a lista de conversas. */
export function DirectMessagesList({
  conversations,
  loaded,
  unreadByRoom,
  typingDms,
  meId,
  isActive,
  onCreate,
  onClose
}: DirectMessagesListProps): React.JSX.Element {
  return (
    <div>
      <div className="group flex items-center justify-between px-2">
        <p className="text-ds-sm font-medium text-gray-400 group-hover:text-gray-200">
          Mensagens diretas
        </p>
        <button
          type="button"
          title="Criar DM"
          aria-label="Criar DM"
          onClick={onCreate}
          className="cursor-pointer text-gray-400 hover:text-strong"
        >
          <PlusIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-1 flex flex-col gap-0.5">
        {!loaded && conversations.length === 0 && <DmListSkeleton />}
        {loaded && conversations.length === 0 && (
          <p className="px-2 py-1 text-ds-sm italic text-gray-500">Nenhuma conversa ainda.</p>
        )}
        {conversations.map((conv) => (
          <ConversationRow
            key={conv.id}
            conv={conv}
            active={isActive(conv)}
            unread={unreadByRoom[`conversation:${conv.id}`] ?? 0}
            typing={typingDms.includes(`conversation:${conv.id}`)}
            meId={meId}
            onClose={onClose}
          />
        ))}
      </div>
    </div>
  )
}

/** Confirmação de sair do grupo (aberta pelo X da linha do grupo). */
export function LeaveGroupConfirm({
  leaving,
  meId,
  onClose,
  onConfirm
}: {
  leaving: ConversationSummary | null
  meId: string | undefined
  onClose: () => void
  onConfirm: () => Promise<void>
}): React.JSX.Element {
  return (
    <ConfirmModal
      open={leaving !== null}
      title={`Sair de '${leaving ? conversationTitle(leaving, meId) : ''}'`}
      confirmLabel="Sair do grupo"
      onClose={onClose}
      onConfirm={onConfirm}
    >
      Tem certeza que quer sair do grupo? Você só volta se alguém te adicionar de novo.
    </ConfirmModal>
  )
}
