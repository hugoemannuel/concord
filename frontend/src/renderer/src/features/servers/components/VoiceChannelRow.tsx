import type { Channel } from '../api/channels'
import { useCallStore } from '../../call/store/callStore'
import VoiceChannelTimer from '../../call/components/VoiceChannelTimer'
import { LockIcon, VolumeIcon } from '../../../shared/ui/icons'
import { useServerStore } from '../store/serverStore'
import { useVoiceParticipants } from '../hooks/useVoiceParticipants'
import { useChannelBadge } from '../hooks/useChannelBadge'
import type { ChannelBadge } from '../lib/channelBadge'
import { useVoiceUserDrop } from '../hooks/useVoiceUserDrop'
import { Perm } from '../lib/permissions'
import type { ServerAccess } from '../lib/serverAccess'
import {
  inviteCallId,
  isConnectedTo,
  voiceRowClass,
  voiceRowTitle,
  WRAP_NAME
} from '../lib/voiceChannelRow'
import VoiceKnockOverlay from './VoiceKnockOverlay'
import VoiceChannelMembers from './VoiceChannelMembers'
import VoiceChatButton from './VoiceChatButton'
import VoiceInviteButton from './VoiceInviteButton'

/** Esconde no hover (sm em diante): o balão do chat e o "•••" ficam no lugar. */
const FADE_ON_HOVER = 'transition-opacity sm:group-hover/voicech:opacity-0'

/**
 * Não lidas do chat do canal, tempo da chamada e quantas pessoas, na altura
 * da primeira linha do nome.
 */
function VoiceChannelMeta({
  people,
  startedAt,
  badge
}: {
  people: number
  startedAt?: string
  badge: ChannelBadge | null
}): React.JSX.Element {
  return (
    <>
      {badge && (
        <span className={`flex h-6 shrink-0 items-center ${FADE_ON_HOVER}`}>
          <span
            title={badge.mention ? 'Menções no chat' : 'Mensagens não lidas no chat'}
            className="rounded-full bg-danger px-1.5 py-0.2 text-ds-xxs font-bold text-white"
          >
            {badge.label}
          </span>
        </span>
      )}
      {people > 0 && startedAt && (
        <span className={`flex h-6 shrink-0 items-center ${FADE_ON_HOVER}`}>
          <VoiceChannelTimer startedAt={startedAt} />
        </span>
      )}
      {people > 0 && (
        <span className={`flex h-6 shrink-0 items-center ${FADE_ON_HOVER}`}>
          <span className="rounded-full bg-fg/10 px-1.5 py-0.2 text-ds-xxs font-bold text-secondary">
            {people}
          </span>
        </span>
      )}
    </>
  )
}

interface VoiceChannelButtonProps {
  channel: Channel
  access: ServerAccess
  connectedHere: boolean
  people: number
  startedAt?: string
  locked: boolean
  dropActive: boolean
  hasMenu: boolean
  /** Tem o botão "Convidar amigos" (estou conectado neste canal). */
  hasInvite: boolean
  badge: ChannelBadge | null
  onJoin: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

/** O canal em si: clicar conecta (ou desconecta, se já estou nele). */
function VoiceChannelButton({
  channel,
  access,
  connectedHere,
  people,
  startedAt,
  locked,
  dropActive,
  hasMenu,
  hasInvite,
  badge,
  onJoin,
  onContextMenu
}: VoiceChannelButtonProps): React.JSX.Element {
  const canConnect = access.canInChannel(channel.id, Perm.CONNECT)
  const isPrivate = access.isPrivate(channel.id)
  return (
    <button
      onClick={onJoin}
      onContextMenu={onContextMenu}
      title={voiceRowTitle(connectedHere, canConnect)}
      className={voiceRowClass({
        canConnect,
        hasMenu,
        hasInvite,
        hasPeople: people > 0,
        dropActive,
        connectedHere
      })}
    >
      {/* Verde só nos canais com gente (pode ser em vários ao mesmo tempo). */}
      <span className="flex h-6 shrink-0 items-center">
        <VolumeIcon
          className={`h-5 w-5 transition-colors ${people > 0 ? 'text-success' : 'text-faint'}`}
        />
      </span>
      {/* Nome inteiro, quebrando linha; tempo e contagem ficam na altura da
          primeira linha. */}
      <span title={channel.name} className={`min-w-0 flex-1 leading-6 ${WRAP_NAME}`}>
        {channel.name}
        {locked && (
          <span title="Sala trancada" className="ml-1.5 inline-flex align-[-1px] text-warning/90">
            <LockIcon className="h-3 w-3" />
            <span className="sr-only">(trancada)</span>
          </span>
        )}
        {(isPrivate || !canConnect) && (
          <span
            title={isPrivate ? 'Canal privado' : 'Sem permissão para entrar'}
            className="ml-1.5 inline-flex align-[-1px] text-faint"
          >
            <LockIcon className="h-3 w-3" />
            <span className="sr-only">(restrito)</span>
          </span>
        )}
      </span>
      <VoiceChannelMeta people={people} startedAt={startedAt} badge={badge} />
    </button>
  )
}

export interface VoiceChannelRowProps {
  channel: Channel
  access: ServerAccess
  onJoin: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  /** O "•••" do canal (só quem abre o menu); onHover = só aparece no hover. */
  renderMenuButton?: (onHover: boolean) => React.ReactNode
  /** O menu do canal, quando aberto. */
  menu?: React.ReactNode
}

/** Um canal de voz na barra de canais, com quem está nele. */
function VoiceChannelRow({
  channel,
  access,
  onJoin,
  onContextMenu,
  renderMenuButton,
  menu
}: VoiceChannelRowProps): React.JSX.Element {
  const serverId = useServerStore((s) => s.currentServer?.id)
  const entry = useCallStore((s) => s.serverCalls[channel.id])
  const connectedHere = useCallStore((s) => isConnectedTo(s, channel.id))
  const inviteCall = useCallStore((s) => inviteCallId(s, channel.id))
  const participants = useVoiceParticipants(entry, serverId)
  const drop = useVoiceUserDrop(channel.id, participants)
  const badge = useChannelBadge(serverId, channel.id)
  const locked = Boolean(entry?.call?.locked)
  return (
    <div className="relative" {...drop.handlers}>
      {/* O "•••" é absoluto, alinhado à primeira linha do nome: precisa ficar
          preso à linha do canal, não ao bloco todo (que cresce com a lista). */}
      <div className="group/voicech relative">
        <VoiceChannelButton
          channel={channel}
          access={access}
          connectedHere={connectedHere}
          people={participants.length}
          startedAt={entry?.call?.started_at}
          locked={locked}
          dropActive={drop.active}
          hasMenu={Boolean(renderMenuButton)}
          hasInvite={inviteCall !== null}
          badge={badge}
          onJoin={onJoin}
          onContextMenu={onContextMenu}
        />
        {renderMenuButton?.(participants.length > 0)}
        {menu}
        <VoiceKnockOverlay
          channelId={channel.id}
          locked={locked}
          connectedHere={connectedHere}
          onJoin={onJoin}
        />
        <VoiceChatButton
          serverId={serverId}
          channelId={channel.id}
          besideMenu={Boolean(renderMenuButton)}
          besideInvite={inviteCall !== null}
        />
        {inviteCall && (
          <VoiceInviteButton callId={inviteCall} besideMenu={Boolean(renderMenuButton)} />
        )}
      </div>
      <VoiceChannelMembers
        channelId={channel.id}
        participants={participants}
        connectedHere={connectedHere}
        access={access}
        onDragEnd={drop.clear}
      />
    </div>
  )
}

export default VoiceChannelRow
