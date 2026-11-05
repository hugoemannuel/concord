import { useNavigate, useParams } from 'react-router-dom'
import type { CallParticipant } from '../../call/api/calls'
import { useAuthStore } from '../../auth/store/authStore'
import { useCallStore } from '../../call/store/callStore'
import { useUserAudioStore } from '../../call/store/userAudioStore'
import { liveUserIds } from '../../call/lib/liveBadge'
import { canMoveVoiceUser, VOICE_USER_DRAG } from '../../call/lib/voiceMove'
import VoiceStateIcons from '../../call/components/VoiceStateIcons'
import LiveBadgeWithPreview from '../../call/components/LiveBadgePreview'
import ArrivalBadge from '../../call/components/ArrivalBadge'
import CallActivityBadge from '../../call/components/CallActivityBadge'
import { GameBadge } from '../../activity/components/ActivityLine'
import { userMenuHandler } from '../../profile/store/userMenuStore'
import { profileCardHandler } from '../../profile/store/profileCardStore'
import StyledName from '../../profile/components/StyledName'
import GuestBadge from '../../guests/components/GuestBadge'
// Na lista do canal de voz o GIF anima sempre, como na chamada (ver CallAvatar).
import Avatar from '../../call/components/CallAvatar'
import MaestroAvatar from '../../music/components/MaestroAvatar'
import { MAESTRO_NAME, maestroIdentity, T18 } from '../../music/lib/music'
import { useMusicStore } from '../../music/store/musicStore'
import { VolumeOffIcon } from '../../../shared/ui/icons'
import { useServerStore } from '../store/serverStore'
import { useServerNicknames } from '../hooks/useServerNames'
import { serverDisplayName } from '../lib/serverNames'
import { Perm } from '../lib/permissions'
import type { ServerAccess } from '../lib/serverAccess'
import { shownVoiceState } from '../lib/voiceChannelRow'

interface ParticipantProps {
  channelId: string
  participant: CallParticipant
  connectedHere: boolean
}

/** Selos à direita: chegou, atividade, jogo, LIVE, silenciado por mim, microfone e fone. */
function VoiceParticipantBadges({
  channelId,
  participant: p,
  connectedHere,
  live,
  isMe,
  name,
  canWatch
}: ParticipantProps & {
  live: boolean
  isMe: boolean
  name: string
  canWatch: boolean
}): React.JSX.Element {
  const mutedByMe = useUserAudioStore((s) => s.settings[p.user_id]?.muted ?? false)
  const selfMuted = useCallStore((s) => s.muted)
  const selfDeafened = useCallStore((s) => s.deafened)
  const state = shownVoiceState(p, isMe && connectedHere, {
    muted: selfMuted,
    deafened: selfDeafened
  })
  return (
    <span className="ml-auto flex items-center gap-0.5 pr-1">
      <ArrivalBadge channelId={channelId} userId={p.user_id} />
      {/* Atividade da chamada: só sabemos de quem joga na nossa. */}
      {connectedHere && <CallActivityBadge userId={p.user_id} arrival={false} />}
      <GameBadge userId={p.user_id} />
      {p.guest_of && <GuestBadge />}
      {live && (
        <LiveBadgeWithPreview
          userId={p.user_id}
          name={name}
          channelId={channelId}
          connectedHere={connectedHere}
          canWatch={canWatch}
        />
      )}
      {!isMe && mutedByMe && (
        <span title="Silenciado por você" className="text-muted">
          <VolumeOffIcon className="h-3.5 w-3.5" />
        </span>
      )}
      <VoiceStateIcons
        muted={state.muted}
        deafened={state.deafened}
        serverMuted={p.server_muted}
        serverDeafened={p.server_deafened}
      />
    </span>
  )
}

/** Uma pessoa no canal de voz; quem pode mover arrasta para outro canal. */
function VoiceParticipantItem({
  channelId,
  participant: p,
  connectedHere,
  live,
  canWatch,
  movable,
  onDragEnd
}: ParticipantProps & {
  live: boolean
  canWatch: boolean
  movable: boolean
  onDragEnd: () => void
}): React.JSX.Element {
  const meId = useAuthStore((s) => s.user?.id)
  const nicknames = useServerNicknames(useServerStore((s) => s.currentServer?.id))
  // Só sabemos quem fala no canal em que estamos conectados.
  const talking = useCallStore((s) => connectedHere && s.speakingIds.includes(p.user_id))
  const nickname = nicknames?.[p.user_id]
  const name = serverDisplayName({ nickname }, p)
  const isMe = p.user_id === meId
  return (
    <div
      onContextMenu={userMenuHandler(p.user_id, name, meId, p.username)}
      onClick={profileCardHandler(p.user_id, name, p.username, 'right')}
      draggable={movable}
      onDragStart={(e) => {
        e.dataTransfer.setData(VOICE_USER_DRAG, p.user_id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragEnd={onDragEnd}
      title={movable ? 'Arraste para outro canal de voz' : undefined}
      className={`group/voiceuser relative flex items-center gap-2 overflow-hidden rounded-md px-2 py-1 transition-colors ${
        isMe ? 'bg-fg/5 hover:bg-fg/10' : 'hover:bg-fg/[0.06]'
      } ${movable ? 'cursor-pointer active:cursor-grabbing' : 'cursor-pointer'}`}
    >
      <Avatar
        userId={p.user_id}
        name={name}
        avatarUrl={p.avatar_url}
        decorationUrl={p.avatar_decoration_url}
        size={24}
        speaking={talking}
        className={`rounded-full transition-shadow ${talking ? 'ring-2 ring-success' : ''}`}
      />
      <span
        title={name}
        className={`min-w-0 truncate text-ds-sm transition-colors group-hover/voiceuser:text-strong ${
          isMe ? 'font-bold text-strong' : 'font-medium text-secondary'
        }`}
      >
        <StyledName name={name} userId={p.user_id} style={nickname ? null : p.name_style} />
      </span>
      {/* Selo de nível só na lista de membros da direita; aqui o nível só
          ordena a lista (ver voiceOrder). */}
      <VoiceParticipantBadges
        channelId={channelId}
        participant={p}
        connectedHere={connectedHere}
        live={live}
        isMe={isMe}
        name={name}
        canWatch={canWatch}
      />
    </div>
  )
}

/**
 * O Maestro aparece como mais alguém no canal; clicar nele abre o painel
 * "Tocando agora" (não o perfil).
 */
function MaestroVoiceItem({ channelId }: { channelId: string }): React.JSX.Element {
  const navigate = useNavigate()
  const { channelId: openChannelId } = useParams<{ channelId: string }>()
  const meId = useAuthStore((s) => s.user?.id)
  const serverId = useServerStore((s) => s.currentServer?.id)
  const togglePanel = useMusicStore((s) => s.togglePanel)
  const open = (): void => {
    togglePanel()
    if (serverId && openChannelId !== channelId)
      navigate(`/servers/${serverId}/channels/${channelId}`)
  }
  return (
    <div
      data-maestro-tile=""
      onContextMenu={userMenuHandler(maestroIdentity(channelId), MAESTRO_NAME, meId)}
      onClick={open}
      className="group/voiceuser relative flex cursor-pointer items-center gap-2 overflow-hidden rounded-md px-2 py-1 transition-colors hover:bg-fg/[0.06]"
    >
      <MaestroAvatar size={24} />
      <span className="min-w-0 truncate text-ds-sm font-medium text-secondary transition-colors group-hover/voiceuser:text-strong">
        {MAESTRO_NAME}
      </span>
      <span className="ml-auto mr-1 rounded bg-brand/30 px-1 text-ds-xxs font-bold uppercase text-brand">
        {T18.tag}
      </span>
    </div>
  )
}

interface VoiceChannelMembersProps {
  channelId: string
  participants: CallParticipant[]
  connectedHere: boolean
  access: ServerAccess
  /** Soltou (ou desistiu de) arrastar alguém. */
  onDragEnd: () => void
}

/** Quem está no canal de voz, embaixo do nome dele (e o Maestro, se toca ali). */
function VoiceChannelMembers({
  channelId,
  participants,
  connectedHere,
  access,
  onDragEnd
}: VoiceChannelMembersProps): React.JSX.Element | null {
  const meId = useAuthStore((s) => s.user?.id)
  const entry = useCallStore((s) => s.serverCalls[channelId])
  const screenSharers = useCallStore((s) => s.screenSharers)
  const serverId = useServerStore((s) => s.currentServer?.id)
  const maestroHere = useMusicStore((s) =>
    Boolean(serverId && s.presence[serverId]?.includes(channelId))
  )
  if (participants.length === 0 && !maestroHere) return null
  const live = liveUserIds(entry, connectedHere ? screenSharers : [])
  const canMoveMembers = access.canInChannel(channelId, Perm.MOVE_MEMBERS)
  // Prévia da live no selo: mesma regra do cartão de perfil (ver e entrar no canal).
  const canWatch = access.canInChannel(channelId, Perm.VIEW_CHANNEL | Perm.CONNECT)
  return (
    <div data-no-drag className="mb-1 ml-4 flex flex-col gap-0.5">
      {participants.map((p) => (
        <VoiceParticipantItem
          key={p.user_id}
          channelId={channelId}
          participant={p}
          connectedHere={connectedHere}
          live={live.has(p.user_id)}
          canWatch={canWatch}
          movable={canMoveVoiceUser({
            meId,
            targetId: p.user_id,
            canMoveMembers,
            canMoveTarget: access.canMoveMember(p.user_id)
          })}
          onDragEnd={onDragEnd}
        />
      ))}
      {maestroHere && <MaestroVoiceItem channelId={channelId} />}
    </div>
  )
}

export default VoiceChannelMembers
