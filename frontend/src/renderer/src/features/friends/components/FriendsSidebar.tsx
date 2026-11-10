import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useUIStore } from '../../../shared/store/uiStore'
import { useFriendStore } from '../store/friendStore'
import { useAuthStore } from '../../auth/store/authStore'
import { useTypingStore } from '../../chat/store/typingStore'
import { typersIn } from '../../chat/lib/typing'
import { useChatStore } from '../../chat/store/chatStore'
import { showToast } from '../../../shared/store/toastStore'
import SidebarFooter from '../../../app/SidebarFooter'
import ResizeHandle from '../../../shared/ui/ResizeHandle'
import { useResizableWidth } from '../../../shared/hooks/useResizableWidth'
import CreateGroupModal from './CreateGroupModal'
import { hideConversation, leaveGroup, type ConversationSummary } from '../../chat/api/conversations'
import {
  DirectMessagesList,
  FavoritesNavButton,
  FriendsNavButton,
  LeaveGroupConfirm
} from './FriendsSidebarSections'
import { dropConversation } from '../lib/dropConversation'

export function FriendsSidebar(): React.JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const { userId, conversationId } = useParams<{ userId: string; conversationId: string }>()
  const meId = useAuthStore((s) => s.user?.id)
  // Só as conversas com alguém digitando: aviso de canal não redesenha a lista.
  const typingDms = useTypingStore(
    useShallow((s) =>
      Object.keys(s.byRoom).filter(
        (room) => room.startsWith('conversation:') && typersIn(s.byRoom, room, meId).length > 0
      )
    )
  )
  const incomingCount = useFriendStore(
    (s) => s.pending.filter((p) => p.direction === 'incoming').length
  )
  const loadAll = useFriendStore((s) => s.loadAll)
  const setFriendsTab = useUIStore((s) => s.setFriendsTab)
  const conversations = useChatStore((s) => s.conversations)
  const conversationsLoaded = useChatStore((s) => s.conversationsLoaded)
  const unreadByRoom = useChatStore((s) => s.unreadByRoom)
  const fetchConversations = useChatStore((s) => s.fetchConversations)
  const setQuickSwitcherOpen = useUIStore((s) => s.setQuickSwitcherOpen)
  const [groupOpen, setGroupOpen] = useState(false)
  const [leaving, setLeaving] = useState<ConversationSummary | null>(null)

  // Mesma preferência de largura na barra de canais e na de DMs/amigos.
  const sidebar = useResizableWidth('channels')

  useEffect(() => {
    loadAll()
    fetchConversations()
  }, [loadAll, fetchConversations])

  const isActive = (conv: ConversationSummary): boolean =>
    conv.type === 'group' ? conv.id === conversationId : conv.other_user?.id === userId

  const drop = (
    conv: ConversationSummary,
    request: (id: string) => Promise<unknown>,
    fallback: string
  ): Promise<void> =>
    dropConversation(
      {
        request,
        removeLocal: (id) =>
          useChatStore.setState((s) => ({
            conversations: s.conversations.filter((c) => c.id !== id)
          })),
        isActive,
        leave: () => navigate('/friends'),
        error: showToast.error
      },
      conv,
      fallback
    )

  const closeConversation = async (conv: ConversationSummary): Promise<void> => {
    if (conv.type === 'group') {
      setLeaving(conv)
      return
    }
    await drop(conv, hideConversation, 'Não foi possível fechar a DM.')
  }

  return (
    <>
      {/* z-10: a alça de redimensionar passa um pouco da borda, sobre o conteúdo. */}
      <aside
        style={sidebar.panelStyle}
        className="relative z-10 flex h-full shrink-0 flex-col border-r border-subtle bg-secondary backdrop-blur-2xl"
      >
        <ResizeHandle {...sidebar.handleProps} />
        <div className="flex h-12 shrink-0 items-center border-b border-subtle px-2.5">
          <button
            type="button"
            onClick={() => setQuickSwitcherOpen(true)}
            className="w-full cursor-pointer truncate rounded-md bg-floating px-2 py-1.5 text-left text-ds-sm text-gray-400 transition-colors hover:text-gray-200"
          >
            Encontre ou comece uma conversa
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-2 py-2">
          <FriendsNavButton
            pathname={location.pathname}
            incomingCount={incomingCount}
            onOpen={() => {
              setFriendsTab('online')
              navigate('/friends')
            }}
          >
            <FavoritesNavButton pathname={location.pathname} onOpen={() => navigate('/favoritas')} />
          </FriendsNavButton>

          <DirectMessagesList
            conversations={conversations}
            loaded={conversationsLoaded}
            unreadByRoom={unreadByRoom}
            typingDms={typingDms}
            meId={meId}
            isActive={isActive}
            onCreate={() => setGroupOpen(true)}
            onClose={closeConversation}
          />
        </div>

        {/* "Voz conectada" na chamada + a barra do usuário (igual em todas as telas) */}
        <SidebarFooter />
      </aside>

      {groupOpen && <CreateGroupModal open onClose={() => setGroupOpen(false)} />}
      <LeaveGroupConfirm
        leaving={leaving}
        meId={meId}
        onClose={() => setLeaving(null)}
        onConfirm={async () => {
          if (!leaving) return
          await drop(leaving, leaveGroup, 'Não foi possível sair do grupo.')
        }}
      />
    </>
  )
}

export default FriendsSidebar
