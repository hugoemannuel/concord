import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useServerStore } from '../store/serverStore'
import { useMusicStore } from '../../music/store/musicStore'
import { useFriendStore } from '../../friends/store/friendStore'
import { useUIStore } from '../../../shared/store/uiStore'
import { useChatStore } from '../../chat/store/chatStore'
import { showToast } from '../../../shared/store/toastStore'
import { useServerAccess } from '../hooks/useServerAccess'
import { chatPermissionsFor } from '../../chat/lib/chatPermissions'
import { Perm } from '../lib/permissions'
import {
  lastServerChannel,
  rememberServerChannel,
  resolveServerChannel
} from '../lib/serverChannel'
import ServerViewLayout, { ServerViewSkeleton } from '../components/ServerViewLayout'
import ProfileScope from '../../memberProfiles/components/ProfileScope'
import ServerRightPanel from '../components/ServerRightPanel'
import ServerThemeHost from '../../serverprofile/components/ServerThemeHost'
import VoiceChatPanel from '../../chat/components/VoiceChatPanel'
import { useServerRightColumn } from '../hooks/useServerRightColumn'
import ServerInviteModal from '../components/ServerInviteModal'
import ServerChannelContent from '../components/ServerChannelContent'
import { ChannelActions, ChannelTitle, ServerSearch } from '../components/ChannelHeaderParts'
import ServerMembersDrawer from '../components/ServerMembersDrawer'
import MobileNavButton from '../../navigation/components/MobileNavButton'
import MembersDrawerButton from '../../navigation/components/MembersDrawerButton'
import CollapsibleSearch from '../../chat/components/CollapsibleSearch'

export function ServerView(): React.JSX.Element {
  const { id, channelId } = useParams<{ id: string; channelId: string }>()

  const currentServer = useServerStore((s) => s.currentServer)
  const currentMembers = useServerStore((s) => s.currentMembers)
  const access = useServerAccess()
  const channels = useServerStore((s) => s.channels)
  const loading = useServerStore((s) => s.loading)
  const selectServer = useServerStore((s) => s.selectServer)
  const fetchChannels = useServerStore((s) => s.fetchChannels)

  const fetchPresenceFor = useChatStore((s) => s.fetchPresenceFor)

  const loadFriends = useFriendStore((s) => s.loadAll)

  const openInviteModal = useUIStore((s) => s.openServerInviteModal)
  const closeInviteModal = useUIStore((s) => s.closeServerInviteModal)

  const [pinsOpen, setPinsOpen] = useState(false)
  const activeChannel = channels.find((c) => c.id === channelId)
  const isVoice = activeChannel?.type === 'voice'
  const { right, chatOverlay } = useServerRightColumn(id, isVoice ? channelId : undefined)

  useEffect(() => {
    return () => closeInviteModal()
  }, [closeInviteModal])

  useEffect(() => {
    if (id) {
      selectServer(id).catch((err) => {
        showToast.error(err instanceof Error ? err.message : 'Falha ao carregar servidor.')
      })
      fetchChannels(id)
      useMusicStore
        .getState()
        .loadPresence(id)
        .catch(() => {})
    }
  }, [id, selectServer, fetchChannels])

  // Guarda o canal de texto aberto para voltar nele ao reabrir o servidor.
  useEffect(() => {
    setPinsOpen(false)
    if (!id || !channelId) return
    const ch = channels.find((c) => c.id === channelId && c.server_id === id)
    if (ch && (ch.type ?? 'text') === 'text') rememberServerChannel(id, channelId)
  }, [id, channelId, channels])

  useEffect(() => {
    if (currentMembers.length > 0) {
      fetchPresenceFor(currentMembers.map((m) => m.user_id))
    }
  }, [currentMembers, fetchPresenceFor])

  useEffect(() => {
    loadFriends()
  }, [loadFriends])

  // currentServer ainda é o anterior no 1º render após clicar noutro servidor.
  if (loading || !currentServer || currentServer.id !== id) return <ServerViewSkeleton />

  // O que a pessoa pode no canal aberto; o servidor confere de novo ao gravar.
  const chatPermissions = chatPermissionsFor(channelId ? access.channelPerms(channelId) : 0)
  if (!channelId) {
    // Só canais deste servidor: `channels` ainda é o do anterior até a busca voltar.
    const target = resolveServerChannel(
      id ?? '',
      currentServer,
      channels,
      id ? lastServerChannel(id) : null
    )
    if (target) return <Navigate to={`/servers/${id}/channels/${target}`} replace />
  }

  return (
    <ProfileScope serverId={currentServer.id}>
      <ServerViewLayout
        right={right}
        bar={
          <>
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <MobileNavButton />
              <ChannelTitle channel={activeChannel} fallback={currentServer.name} />
            </div>
            <ChannelActions
              channelId={channelId}
              isVoice={isVoice}
              pinsOpen={pinsOpen}
              onTogglePins={() => setPinsOpen((v) => !v)}
              onClosePins={() => setPinsOpen(false)}
              canInvite={access.can(Perm.CREATE_INVITE)}
              onInvite={openInviteModal}
              canModerate={chatPermissions.canModerate}
            />
            <MembersDrawerButton />
          </>
        }
        search={
          <CollapsibleSearch>
            <ServerSearch server={currentServer} />
          </CollapsibleSearch>
        }
        content={
          <ServerChannelContent
            server={currentServer}
            channelId={channelId}
            channel={activeChannel}
            permissions={chatPermissions}
          />
        }
        rightPanel={<ServerRightPanel right={right} server={currentServer} channelId={channelId} />}
      >
        {/* Tela estreita: o chat da call é uma sobreposição em tela cheia. */}
        {chatOverlay && channelId && <VoiceChatPanel channelId={channelId} />}
        <ServerThemeHost serverId={currentServer.id} />
        <ServerInviteModal server={currentServer} />
        <ServerMembersDrawer server={currentServer} />
      </ServerViewLayout>
    </ProfileScope>
  )
}

export default ServerView
