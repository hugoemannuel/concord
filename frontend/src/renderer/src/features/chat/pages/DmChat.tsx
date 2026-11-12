import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useAuthStore } from '../../auth/store/authStore'
import { useFriendStore } from '../../friends/store/friendStore'
import { useUserMenuStore } from '../../profile/store/userMenuStore'
import { useChatStore } from '../store/chatStore'
import DmCallButton from '../components/DmCallButton'
import DmMessages from '../components/DmMessages'
import DmPeerHeader from '../components/DmPeerHeader'
import MessageSearchBar from '../components/MessageSearchBar'
import { useDmConversation } from '../hooks/useDmConversation'
import { useDmPeer } from '../hooks/useDmPeer'
import { dmMenuTarget } from '../lib/dmPeer'
import CollapsibleSearch from '../components/CollapsibleSearch'
import DisappearingButton from '../../disappearing/components/DisappearingButton'
import MobileNavButton from '../../navigation/components/MobileNavButton'

function DmChat(): React.JSX.Element {
  const { userId } = useParams<{ userId: string }>()
  const meId = useAuthStore((s) => s.user?.id)
  const loadFriends = useFriendStore((s) => s.loadAll)
  const fetchConversations = useChatStore((s) => s.fetchConversations)
  const { conversationId, error } = useDmConversation(userId)
  const { peer, look, status, online, blocked, withBot, access, searchUsers } = useDmPeer(userId)

  useEffect(() => {
    loadFriends()
    fetchConversations()
  }, [loadFriends, fetchConversations])

  const openMenu = (e: React.MouseEvent): void => {
    const target = dmMenuTarget(userId, meId, look.name, peer.handle, conversationId)
    if (!target) return
    e.preventDefault()
    useUserMenuStore.getState().open({ ...target, x: e.clientX, y: e.clientY })
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-primary backdrop-blur-2xl text-strong">
      <header
        onContextMenu={openMenu}
        className="relative flex h-14 shrink-0 items-center gap-2 border-b border-subtle px-4 sm:gap-3"
      >
        <MobileNavButton />
        <DmPeerHeader
          userId={userId}
          other={peer.other}
          name={look.name}
          avatarName={peer.name}
          handle={peer.handle}
          status={status}
        />
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          {withBot ? null : (
            <DmCallButton
              userId={userId}
              conversationId={conversationId}
              name={peer.name}
              handle={peer.handle}
              online={online}
              blocked={blocked}
            />
          )}
          <DisappearingButton conversationId={conversationId} />
          {conversationId && (
            <CollapsibleSearch>
              <MessageSearchBar
                scope={{ kind: 'conversation', id: conversationId }}
                name={look.name}
                users={searchUsers}
              />
            </CollapsibleSearch>
          )}
        </div>
      </header>

      <DmMessages
        userId={userId}
        conversationId={conversationId}
        error={error}
        peer={peer}
        access={access}
      />
    </div>
  )
}

export default DmChat
