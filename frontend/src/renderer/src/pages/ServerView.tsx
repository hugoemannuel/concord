import { useEffect, useState } from 'react'
import { userMenuHandler } from '../store/userMenuStore'
import { profileCardHandler } from '../store/profileCardStore'
import InviteCodeBox from '../components/InviteCodeBox'
import { Navigate, useParams } from 'react-router-dom'
import { useServerStore } from '../store/serverStore'
import { useMusicStore } from '../store/musicStore'
import { T18 } from '../lib/music'
import { useFriendStore } from '../store/friendStore'
import { useAuthStore } from '../store/authStore'
import { useUIStore } from '../store/uiStore'
import { useChatStore, usePresenceStatus } from '../store/chatStore'
import { showToast } from '../store/toastStore'
import Button from '../components/Button'
import Input from '../components/Input'
import Modal from '../components/Modal'
import ChatPane from '../components/ChatPane'
import VoiceChannelView from '../components/call/VoiceChannelView'
import { UserPlusIcon, SearchIcon, VolumeIcon, PinIcon } from '../components/icons'
import PinnedMessagesPopover from '../components/chat/PinnedMessagesPopover'
import LevelBadge from '../components/level/LevelBadge'
import LevelRowShimmer from '../components/level/LevelRowShimmer'
import LevelUpBurst from '../components/level/LevelUpBurst'
import Avatar from '../components/Avatar'
import { useUserLook } from '../store/profileStore'
import ResizeHandle from '../components/ResizeHandle'
import { useResizableWidth } from '../components/useResizableWidth'
import { useServerAccess } from '../store/useServerAccess'
import { groupMembers, memberColor } from '../lib/memberGroups'
import { chatPermissionsFor } from '../lib/chatPermissions'
import { Perm, roleColorCss } from '../lib/permissions'
import { serverDisplayName } from '../lib/serverNames'
import { ActivityLine } from '../components/ActivityLine'
import { useActivity, useInVoice } from '../store/presenceActivityStore'
import {
  lastServerChannel,
  rememberServerChannel,
  resolveServerChannel
} from '../lib/serverChannel'
import StyledName from '../components/StyledName'
import type { NameStyle } from '../lib/nameStyle'

interface MemberRowProps {
  userId: string
  displayName: string
  /** Apelido neste servidor (ganha do nome de exibição). */
  nickname?: string | null
  /** Fonte/efeito do nome de exibição (só vale sem apelido). */
  nameStyle?: NameStyle
  handle: string
  avatarUrl?: string | null
  colorClass: string
  nameClass: string
  /** Cor do cargo mais alto que tem cor (CSS); sem ela vale nameClass. */
  nameColor?: string
  online: boolean
  isBot?: boolean
}

function MemberRow({
  userId,
  displayName,
  nickname,
  nameStyle,
  handle,
  avatarUrl,
  colorClass,
  nameClass,
  nameColor,
  online,
  isBot = false
}: MemberRowProps): React.JSX.Element {
  const meId = useAuthStore((s) => s.user?.id)
  const status = usePresenceStatus(userId)
  // Só troca o @handle quando há jogo (ou "Em voz"): sem atividade, igual a antes.
  const hasActivity = useActivity(userId) !== null
  const inVoice = useInVoice(userId)
  const activityShown = hasActivity || inVoice
  const look = useUserLook(userId, { name: displayName, avatarUrl })
  const name = serverDisplayName({ nickname }, { display_name: look.name })
  return (
    <div
      key={userId}
      // Na lista de membros o menu abre até em você (para "Alterar apelido").
      onContextMenu={userMenuHandler(userId, name, meId, handle, { allowSelf: true })}
      onClick={profileCardHandler(userId, name, handle, 'left')}
      className={`group relative flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1 hover:bg-white/5 ${
        online ? '' : 'opacity-60 hover:opacity-100'
      }`}
    >
      <LevelRowShimmer userId={userId} />
      <div className="relative shrink-0">
        <LevelUpBurst userId={userId} />
        <Avatar
          userId={userId}
          name={name}
          avatarUrl={avatarUrl}
          size={32}
          // O Maestro não tem websocket: está sempre online.
          status={isBot ? 'online' : status}
          cutoutColor="#07080b"
          fallbackClassName={colorClass}
        />
      </div>
      <div className="relative min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <p
            title={name}
            style={nameColor ? { color: nameColor } : undefined}
            className={`truncate text-ds-md font-medium ${nameColor ? '' : nameClass}`}
          >
            {nickname?.trim() ? (
              name
            ) : (
              <StyledName name={name} userId={userId} style={nameStyle} />
            )}
          </p>
          {isBot ? (
            <span className="rounded bg-violet-400/30 px-1 text-[9px] font-bold uppercase text-violet-100">
              {T18.tag}
            </span>
          ) : (
            <LevelBadge userId={userId} />
          )}
        </div>
        {activityShown ? (
          <ActivityLine
            userId={userId}
            statusLabel={`@${handle}`}
            className="-mt-0.5 text-ds-xs font-medium text-gray-400"
          />
        ) : (
          <p title={`@${handle}`} className="-mt-0.5 truncate text-ds-xs font-medium text-gray-400">
            @{handle}
          </p>
        )}
      </div>
    </div>
  )
}

/** Lista de membros à direita, com a borda de dentro arrastável. */
function MembersAside({ children }: { children: React.ReactNode }): React.JSX.Element {
  const panel = useResizableWidth('members')
  return (
    <aside
      style={panel.panelStyle}
      className="relative hidden shrink-0 flex-col border-l border-white/6 bg-[#07080b]/60 lg:flex"
    >
      <ResizeHandle {...panel.handleProps} />
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">{children}</div>
    </aside>
  )
}

export function ServerView(): React.JSX.Element {
  const { id, channelId } = useParams<{ id: string; channelId: string }>()
  const me = useAuthStore((s) => s.user)

  const currentServer = useServerStore((s) => s.currentServer)
  const currentMembers = useServerStore((s) => s.currentMembers)
  const roles = useServerStore((s) => s.roles)
  const access = useServerAccess()
  const channels = useServerStore((s) => s.channels)
  const serverInvites = useServerStore((s) => s.serverInvites)
  const loading = useServerStore((s) => s.loading)
  const selectServer = useServerStore((s) => s.selectServer)
  const fetchChannels = useServerStore((s) => s.fetchChannels)
  const inviteUser = useServerStore((s) => s.inviteUser)
  const fetchServerInvites = useServerStore((s) => s.fetchServerInvites)

  const presence = useChatStore((s) => s.presence)
  const fetchPresenceFor = useChatStore((s) => s.fetchPresenceFor)

  const friends = useFriendStore((s) => s.friends)
  const loadFriends = useFriendStore((s) => s.loadAll)

  const inviteModalOpen = useUIStore((s) => s.serverInviteModalOpen)
  const openInviteModal = useUIStore((s) => s.openServerInviteModal)
  const closeInviteModal = useUIStore((s) => s.closeServerInviteModal)

  const [inviteFilter, setInviteFilter] = useState('')
  const [invitingId, setInvitingId] = useState<string | null>(null)
  const [pinsOpen, setPinsOpen] = useState(false)

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
    if (inviteModalOpen && id) {
      fetchServerInvites(id)
    }
  }, [inviteModalOpen, id, fetchServerInvites])

  useEffect(() => {
    loadFriends()
  }, [loadFriends])

  const handleInvite = async (friendUserId: string, friendUsername: string): Promise<void> => {
    if (!id) return
    setInvitingId(friendUserId)
    try {
      await inviteUser(id, friendUserId)
      showToast.success(`Convite enviado para @${friendUsername}!`)
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : 'Falha ao convidar amigo.')
    } finally {
      setInvitingId(null)
    }
  }

  // currentServer ainda é o anterior no 1º render após clicar noutro servidor.
  if (loading || !currentServer || currentServer.id !== id) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#07080b]/90 text-gray-400">
        <p className="text-ds-md">Carregando servidor...</p>
      </div>
    )
  }

  const memberUserIds = new Set(currentMembers.map((m) => m.user_id))
  // O que a pessoa pode no canal aberto; o servidor confere de novo ao gravar.
  const chatPermissions = chatPermissionsFor(channelId ? access.channelPerms(channelId) : 0)
  const canMentionEveryone = chatPermissions.canMentionEveryone
  const pendingInviteUserIds = new Set(serverInvites.map((i) => i.invitee_id))

  const inviteTerm = inviteFilter.trim().toLowerCase()
  const filteredFriends = friends.filter((f) => {
    if (!inviteTerm) return true
    return (
      (f.display_name ?? '').toLowerCase().includes(inviteTerm) ||
      f.username.toLowerCase().includes(inviteTerm)
    )
  })

  // Como no Discord: dono, cargos exibidos separadamente (online), membros e offline.
  const memberGroups = groupMembers({
    members: currentMembers,
    roles,
    ownerId: currentServer.owner_id,
    // O Maestro não tem websocket: está sempre online.
    isOnline: (userId) =>
      Boolean(presence[userId]) || currentMembers.some((m) => m.user_id === userId && m.is_bot)
  })

  const activeChannel = channels.find((c) => c.id === channelId)

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
    <div className="flex h-full w-full overflow-hidden bg-[#07080b]/90 backdrop-blur-2xl text-gray-100">
      {/* Central Server View Column */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-r border-white/6">
        {/* Top Channel Header Bar */}
        <header className="relative flex h-14 shrink-0 items-center justify-between border-b border-white/6 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex min-w-0 items-center gap-2 text-gray-300">
              {activeChannel?.type === 'voice' ? (
                <VolumeIcon className="h-5 w-5 text-gray-400" />
              ) : (
                <span className="text-gray-400 text-xl font-bold">#</span>
              )}
              <span
                title={activeChannel?.name ?? currentServer.name}
                className="truncate text-ds-md font-semibold text-white"
              >
                {activeChannel?.name ?? currentServer.name}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeChannel?.type !== 'voice' && channelId && (
              <button
                type="button"
                onClick={() => setPinsOpen((v) => !v)}
                title="Mensagens Fixadas"
                className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                  pinsOpen
                    ? 'border-amber-500/50 bg-amber-500/10 text-amber-400'
                    : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20 hover:text-white'
                }`}
              >
                <PinIcon className="h-4 w-4" />
              </button>
            )}
            {/* Quem tem CREATE_INVITE convida (por padrão, todo membro) */}
            {access.can(Perm.CREATE_INVITE) && (
              <Button
                variant="secondary"
                className="flex items-center gap-1.5 px-3 py-1.5 text-ds-sm font-medium"
                onClick={openInviteModal}
              >
                <UserPlusIcon className="h-4 w-4" />
                <span>Convidar</span>
              </Button>
            )}
          </div>

          {pinsOpen && channelId && (
            <PinnedMessagesPopover
              channelId={channelId}
              canModerate={chatPermissions.canModerate}
              onClose={() => setPinsOpen(false)}
            />
          )}
        </header>

        {channelId && activeChannel?.type === 'voice' ? (
          <VoiceChannelView channelId={channelId} />
        ) : channelId ? (
          <ChatPane
            room={`channel:${channelId}`}
            serverId={currentServer.id}
            placeholder={`Mensagem para #${activeChannel?.name ?? 'canal'}`}
            canMentionEveryone={canMentionEveryone}
            permissions={chatPermissions}
            canDeleteMessages={!activeChannel?.is_system}
            mentionable={currentMembers
              .filter((m) => m.username)
              .map((m) => ({
                username: m.username as string,
                display_name: m.display_name || (m.username as string),
                nickname: m.nickname
              }))}
          />
        ) : (
          <div className="flex flex-1 flex-col justify-between overflow-y-auto p-6">
            <div className="my-auto max-w-lg space-y-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-violet-600/30 border border-violet-500/40 text-violet-300 font-bold text-2xl shadow-lg">
                #
              </div>
              <h1 className="text-ds-xxl font-bold text-white">
                Bem-vindo a #{currentServer.name}!
              </h1>
              <p className="text-ds-md text-gray-400">
                Este é o início do servidor{' '}
                <strong className="text-white">{currentServer.name}</strong>. Convide seus amigos e
                comece a conversar!
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Right Column: Server Members List */}
      <MembersAside>
        {memberGroups.map((group) => {
          const offline = group.key === 'offline'
          return (
            <div key={group.key}>
              <p className="mb-1 text-ds-sm font-medium text-gray-400">
                {group.title} — {group.members.length}
              </p>
              <div className={`flex flex-col gap-1 ${offline ? 'opacity-70' : ''}`}>
                {group.members.map((m) => {
                  const isOwner = m.user_id === currentServer.owner_id
                  const displayName =
                    m.display_name ??
                    m.username ??
                    (m.user_id === me?.id ? me?.display_name : 'Membro')
                  const handle = m.username ?? (m.user_id === me?.id ? me?.username : 'membro')
                  return (
                    <MemberRow
                      key={m.user_id}
                      userId={m.user_id}
                      displayName={displayName ?? 'Membro'}
                      nickname={m.nickname}
                      nameStyle={m.name_style}
                      avatarUrl={m.avatar_url}
                      handle={handle ?? 'membro'}
                      colorClass={
                        offline ? 'bg-gray-600' : isOwner ? 'bg-amber-600' : 'bg-indigo-600'
                      }
                      nameClass={
                        offline ? 'text-gray-400' : isOwner ? 'text-amber-300' : 'text-gray-200'
                      }
                      nameColor={roleColorCss(memberColor(roles, m.role_ids))}
                      online={!offline}
                      isBot={!!m.is_bot}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </MembersAside>

      {/* Modal Convidar Amigos */}
      <Modal
        open={inviteModalOpen}
        title={`Convidar amigos para ${currentServer.name}`}
        onClose={closeInviteModal}
      >
        <div className="space-y-4">
          <InviteCodeBox serverId={currentServer.id} />
          <p className="text-ds-sm text-gray-400">
            Ou selecione um amigo para enviar um convite. Ele poderá aceitar ou recusar.
          </p>

          <div className="relative">
            <Input
              placeholder="Buscar amigo por nome"
              value={inviteFilter}
              onChange={(e) => setInviteFilter(e.target.value)}
              className="glass-input pl-9 text-ds-md"
              autoFocus
            />
            <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          </div>

          {friends.length === 0 ? (
            <p className="py-6 text-center text-xs text-gray-500 italic">
              Você ainda não tem amigos para convidar. Adicione amigos primeiro na aba
              &quot;Amigos&quot;.
            </p>
          ) : (
            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto no-scrollbar pr-1">
              {filteredFriends.map((f) => {
                const alreadyInServer = memberUserIds.has(f.id)
                const alreadyInvited = pendingInviteUserIds.has(f.id)
                const isInviting = invitingId === f.id

                return (
                  <div
                    key={f.id}
                    className="flex items-center justify-between rounded-xl border border-white/6 bg-white/3 p-2.5"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar
                        userId={f.id}
                        name={f.display_name ?? f.username}
                        avatarUrl={f.avatar_url}
                        size={32}
                      />
                      <div className="leading-tight">
                        <p className="text-ds-md font-medium text-white">{f.display_name}</p>
                        <p className="text-ds-xs text-gray-400">@{f.username}</p>
                      </div>
                    </div>

                    {alreadyInServer ? (
                      <span className="text-xs text-gray-500">Já é membro</span>
                    ) : alreadyInvited ? (
                      <span className="text-xs text-violet-300">Convite pendente</span>
                    ) : (
                      <Button
                        variant="success"
                        className="px-3 py-1 text-xs"
                        disabled={isInviting}
                        onClick={() => handleInvite(f.id, f.username)}
                      >
                        {isInviting ? 'Convidando...' : 'Convidar'}
                      </Button>
                    )}
                  </div>
                )
              })}

              {filteredFriends.length === 0 && (
                <p className="py-6 text-center text-xs text-gray-500 italic">
                  Nenhum amigo encontrado para &quot;{inviteFilter}&quot;.
                </p>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

export default ServerView
