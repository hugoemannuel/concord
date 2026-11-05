import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import { colors, spacing } from '../../../shared/theme/tokens'
import { Banner } from '../../../shared/ui/Banner'
import { Button } from '../../../shared/ui/Button'
import { CallBar } from '../../call/components/CallBar'
import { CallNotice } from '../../call/components/CallNotice'
import { useVoiceRoster } from '../../call/hooks/useVoiceRoster'
import { DirectMessages, type OpenConversationArgs } from '../../chat/components/DirectMessages'
import { railDmsOf, totalUnread } from '../../chat/lib/unreadCounts'
import { useConversationsStore } from '../../chat/store/conversationsStore'
import { useAuthStore } from '../../auth/store/authStore'
import { useUnreadStore } from '../../chat/store/unreadStore'
import { UserPanel } from '../../profile/components/UserPanel'
import type { Channel } from '../api/channels'
import { useSelectedServerStore } from '../store/selectedServerStore'
import { useServersStore } from '../store/serversStore'
import { ChannelList } from './ChannelList'
import { ServerRail } from './ServerRail'

interface HomeScreenProps {
  onOpenChannel: (channel: Channel) => void
  onOpenConversation: (conversation: OpenConversationArgs) => void
  onOpenFriends: () => void
  /** Toque num canal de voz: entra na chamada. */
  onJoinVoice: (channel: Channel) => void
  /** Barra de chamada: abre a tela cheia. */
  onOpenCall: () => void
  onLeaveCall: () => void
  onOpenSettings: () => void
  /** O diamante do trilho abre a aba Melhorias. */
  onOpenHub?: () => void
  /** Tocar na foto do painel de baixo abre o perfil de quem está logado. */
  onOpenProfile?: (userId: string) => void
}

/** Tela principal: trilho de servidores, lista de canais (ou DMs) e o painel do usuário. */
export function HomeScreen({ onOpenChannel, onOpenConversation, onOpenFriends, onJoinVoice, onOpenCall, onLeaveCall, onOpenSettings, onOpenProfile, onOpenHub }: HomeScreenProps) {
  const servers = useServersStore((s) => s.servers)
  const status = useServersStore((s) => s.status)
  const channelsByServer = useServersStore((s) => s.channelsByServer)
  const layoutByServer = useServersStore((s) => s.layoutByServer)
  const channelsError = useServersStore((s) => s.channelsError)
  const load = useServersStore((s) => s.load)
  const loadChannels = useServersStore((s) => s.loadChannels)
  const serverId = useSelectedServerStore((s) => s.serverId)
  const select = useSelectedServerStore((s) => s.select)
  const conversations = useConversationsStore((s) => s.conversations)
  const dmUnread = totalUnread(conversations)
  const myId = useAuthStore((s) => s.user?.id)
  const unreadServers = useUnreadStore((s) => s.byServer)
  const unreadChannels = useUnreadStore((s) => s.byChannel)
  const ensureSelection = useSelectedServerStore((s) => s.ensureSelection)

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    ensureSelection(servers.map((server) => server.id))
  }, [servers, ensureSelection])

  const needsChannels = serverId !== null && channelsByServer[serverId] === undefined
  useEffect(() => {
    if (serverId && needsChannels) void loadChannels(serverId)
  }, [serverId, needsChannels, loadChannels])

  const server = servers.find((s) => s.id === serverId)
  const voiceMembers = useVoiceRoster(serverId)

  return (
    <View style={styles.screen}>
      <View style={styles.columns}>
        <ServerRail
          servers={servers}
          selectedId={serverId}
          onSelect={select}
          dmUnread={dmUnread}
          unreadServers={unreadServers}
          onOpenHub={onOpenHub}
          unreadDms={railDmsOf(conversations, myId)}
          onOpenDm={(dm) => onOpenConversation({ id: dm.id, title: dm.title, type: dm.type })}
        />
        <View style={styles.main}>
          {status === 'error' && servers.length === 0 ? (
            <View style={styles.centered}>
              <Banner message="Não foi possível carregar os servidores." />
              <Button title="Tentar de novo" onPress={() => void load()} variant="secondary" />
            </View>
          ) : server ? (
            <ChannelList
              serverName={server.name}
              channels={channelsByServer[server.id] ?? []}
              layout={layoutByServer[server.id]}
              error={channelsError[server.id] === true}
              unreadChannels={unreadChannels}
              voiceMembers={voiceMembers}
              onOpenChannel={onOpenChannel}
              onJoinVoice={onJoinVoice}
              onRetry={() => void loadChannels(server.id)}
            />
          ) : (
            <DirectMessages onOpenConversation={onOpenConversation} onOpenFriends={onOpenFriends} />
          )}
        </View>
      </View>
      <CallNotice />
      <CallBar onOpen={onOpenCall} onLeave={onLeaveCall} />
      <UserPanel onOpenSettings={onOpenSettings} onOpenProfile={onOpenProfile} />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgTertiary },
  columns: { flex: 1, flexDirection: 'row' },
  main: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl, backgroundColor: colors.bgPrimary }
})
