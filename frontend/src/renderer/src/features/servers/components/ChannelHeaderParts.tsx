import { useServerStore } from '../store/serverStore'
import Button from '../../../shared/ui/Button'
import { UserPlusIcon, VolumeIcon, PinIcon } from '../../../shared/ui/icons'
import PinnedMessagesPopover from '../../chat/components/PinnedMessagesPopover'
import PluginHeaderButtons from '../../plugins/components/PluginHeaderButtons'
import MessageSearchBar from '../../chat/components/MessageSearchBar'
import type { Channel } from '../api/channels'
import ChannelDisappearingMark from '../../disappearing/components/ChannelDisappearingMark'
import type { DisappearingSeconds } from '../../disappearing/lib/disappearing'
import type { Server } from '../api/servers'

/** Ícone (# ou alto-falante) e nome do canal aberto; sem canal, o do servidor. */
export function ChannelTitle({
  channel,
  fallback
}: {
  channel: Channel | undefined
  fallback: string
}): React.JSX.Element {
  const name = channel?.name ?? fallback
  return (
    <div className="flex min-w-0 items-center gap-2 text-secondary">
      {channel?.type === 'voice' ? (
        <VolumeIcon className="h-5 w-5 text-muted" />
      ) : (
        <span className="text-muted text-ds-lg font-bold">#</span>
      )}
      <span title={name} className="truncate text-ds-md font-semibold text-strong">
        {name}
      </span>
      <ChannelDisappearingMark
        seconds={channel?.disappearing_seconds as DisappearingSeconds | null | undefined}
      />
    </div>
  )
}

interface ChannelActionsProps {
  channelId: string | undefined
  isVoice: boolean
  pinsOpen: boolean
  onTogglePins: () => void
  onClosePins: () => void
  /** Quem tem CREATE_INVITE convida (por padrão, todo membro). */
  canInvite: boolean
  onInvite: () => void
  canModerate: boolean
}

/** Ações do canal na barra de cima: mensagens fixadas e "Convidar". */
export function ChannelActions({
  channelId,
  isVoice,
  pinsOpen,
  onTogglePins,
  onClosePins,
  canInvite,
  onInvite,
  canModerate
}: ChannelActionsProps): React.JSX.Element {
  const showPins = !isVoice && Boolean(channelId)
  return (
    <>
      <div className="flex shrink-0 items-center gap-2">
        {showPins && (
          <button
            type="button"
            onClick={onTogglePins}
            title="Mensagens fixadas"
            aria-label="Mensagens fixadas"
            aria-expanded={pinsOpen}
            className={`flex size-10 items-center justify-center rounded-lg border transition md:size-8 ${
              pinsOpen
                ? 'border-warning/50 bg-warning/10 text-warning'
                : 'border-subtle bg-fg/5 text-muted hover:border-normal hover:text-strong'
            }`}
          >
            <PinIcon className="h-4 w-4" />
          </button>
        )}
        {showPins && <PluginHeaderButtons />}
        {canInvite && (
          <Button
            variant="secondary"
            className="flex items-center gap-1.5 px-3 py-1.5 text-ds-sm font-medium max-md:size-10 max-md:justify-center max-md:px-0"
            onClick={onInvite}
          >
            <UserPlusIcon className="h-4 w-4" />
            <span className="max-md:sr-only">Convidar</span>
          </Button>
        )}
      </div>
      {pinsOpen && channelId && (
        <PinnedMessagesPopover
          channelId={channelId}
          canModerate={canModerate}
          onClose={onClosePins}
        />
      )}
    </>
  )
}

/** "Buscar em {servidor}": pessoas e canais de texto do servidor como filtros. */
export function ServerSearch({ server }: { server: Server }): React.JSX.Element {
  const members = useServerStore((s) => s.currentMembers)
  const channels = useServerStore((s) => s.channels)
  return (
    <MessageSearchBar
      scope={{ kind: 'server', id: server.id }}
      name={server.name}
      users={members
        .filter((m) => m.username)
        .map((m) => ({
          id: m.user_id,
          username: m.username as string,
          displayName: m.display_name || (m.username as string),
          nickname: m.nickname,
          avatarUrl: m.avatar_url
        }))}
      channels={channels
        .filter((c) => c.server_id === server.id && (c.type ?? 'text') === 'text')
        .map((c) => ({ id: c.id, name: c.name }))}
    />
  )
}
