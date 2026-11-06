import { useEffect, useRef } from 'react'
import { usePinStore, selectPins } from '../store/pinStore'
import { useServerStore } from '../../servers/store/serverStore'
import { useServerMemberColor, useServerNicknames } from '../../servers/hooks/useServerNames'
import { serverDisplayName } from '../../servers/lib/serverNames'
import { PinIcon } from '../../../shared/ui/icons'
import Avatar from '../../../shared/ui/Avatar'
import type { PinnedMessage } from '../api/messages'
import MessageAttachments from './MessageAttachments'
import MessageSticker from './MessageSticker'
import MessageGif from './MessageGif'
import { PinnedListSkeleton } from '../../../shared/ui/skeleton/layouts'
import { formatMessageDateTime } from '../lib/messageDateTime'
import { useDismiss } from '../../../shared/hooks/useDismiss'
import CloseButton from '../../../shared/ui/CloseButton'

interface PinnedMessagesPopoverProps {
  channelId: string
  canModerate: boolean
  onClose: () => void
}

function PinnedMessageItem({
  pin,
  serverId,
  nicknames,
  canModerate,
  onJump,
  onUnpin
}: {
  pin: PinnedMessage
  serverId: string | undefined
  nicknames: Record<string, string> | undefined
  canModerate: boolean
  onJump: (id: string) => void
  onUnpin: (id: string) => void
}): React.JSX.Element {
  const authorName = serverDisplayName(
    { nickname: nicknames?.[pin.author_id] },
    pin.author,
    'Usuário'
  )
  const authorColor = useServerMemberColor(serverId, pin.author_id)
  const pinnedByName = serverDisplayName(
    { nickname: pin.pinned_by_id ? nicknames?.[pin.pinned_by_id] : undefined },
    pin.pinned_by,
    'Alguém'
  )

  return (
    <div className="group relative rounded-lg border border-subtle bg-floating p-3 transition hover:border-normal hover:bg-floating">
      {/* Cabeçalho do Card */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar
            userId={pin.author_id}
            name={authorName}
            avatarUrl={pin.author?.avatar_url}
            decorationUrl={pin.author?.avatar_decoration_url}
            size={24}
          />
          <span
            style={authorColor ? { color: authorColor } : undefined}
            className={`truncate text-ds-sm font-semibold ${authorColor ? '' : 'text-strong'}`}
          >
            {authorName}
          </span>
          <span className="text-ds-xs text-faint">{formatMessageDateTime(pin.created_at)}</span>
        </div>

        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
          <button
            type="button"
            onClick={() => onJump(pin.id)}
            title="Ir para a mensagem no chat"
            className="rounded bg-fg/5 px-2 py-0.5 text-ds-xs font-medium text-secondary hover:bg-brand hover:text-white"
          >
            Ir
          </button>
          {canModerate && (
            <button
              type="button"
              onClick={() => onUnpin(pin.id)}
              title="Desafixar mensagem"
              className="rounded bg-fg/5 px-2 py-0.5 text-ds-xs font-medium text-muted hover:bg-danger/20 hover:text-danger"
            >
              Desafixar
            </button>
          )}
        </div>
      </div>

      {/* Conteúdo do Card */}
      {pin.content && (
        <p className="mt-2 whitespace-pre-wrap break-words text-ds-sm text-normal">
          {pin.content}
        </p>
      )}

      {pin.sticker && (
        <div className="mt-2">
          <MessageSticker sticker={pin.sticker} />
        </div>
      )}

      {pin.gif_url && (
        <div className="mt-2">
          <MessageGif gifUrl={pin.gif_url} metadata={pin.gif_metadata} />
        </div>
      )}

      {/* Anexos */}
      {pin.attachments && pin.attachments.length > 0 && (
        <div className="mt-2">
          <MessageAttachments attachments={pin.attachments} copyImages />
        </div>
      )}

      {/* Rodapé: Quem fixou */}
      <div className="mt-2.5 flex items-center gap-1 text-ds-xxs text-faint">
        <PinIcon className="h-3 w-3 text-warning/80" />
        <span>
          Fixado por <strong className="text-muted">{pinnedByName}</strong> em{' '}
          {formatMessageDateTime(pin.pinned_at)}
        </span>
      </div>
    </div>
  )
}

export default function PinnedMessagesPopover({
  channelId,
  canModerate,
  onClose
}: PinnedMessagesPopoverProps): React.JSX.Element {
  const popoverRef = useRef<HTMLDivElement>(null)
  const pins = usePinStore(selectPins(channelId))
  const loading = usePinStore((s) => s.loadingByChannel[channelId] ?? false)
  // Já buscou este canal alguma vez: abrir de novo mostra as fixadas na hora.
  const pinsLoaded = usePinStore((s) => s.pinsByChannel[channelId] !== undefined)
  const loadPins = usePinStore((s) => s.loadPins)
  const unpin = usePinStore((s) => s.unpin)
  const serverId = useServerStore((s) => s.currentServer?.id)
  const nicknames = useServerNicknames(serverId)

  useEffect(() => {
    void loadPins(channelId)
  }, [channelId, loadPins])

  // Fecha ao clicar fora ou apertar Escape
  useDismiss((target) => !popoverRef.current || popoverRef.current.contains(target), () => onClose())

  const handleJump = (messageId: string): void => {
    window.dispatchEvent(
      new CustomEvent('concord:jump-to-message', {
        detail: { messageId }
      })
    )
  }

  const handleUnpin = async (messageId: string): Promise<void> => {
    try {
      await unpin(channelId, messageId)
    } catch {
      // Toast já exibido pela store
    }
  }

  return (
    <div
      ref={popoverRef}
      className="absolute right-4 top-14 z-50 flex max-h-[540px] w-96 flex-col rounded-xl border border-subtle bg-accent shadow-2xl backdrop-blur-md"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-subtle px-4 py-3">
        <div className="flex items-center gap-2">
          <PinIcon className="h-4 w-4 text-warning" />
          <h3 className="text-ds-sm font-semibold text-strong">Mensagens fixadas</h3>
          <span className="rounded bg-fg/10 px-1.5 py-0.5 text-ds-xs font-medium text-secondary">
            {pins.length}/50
          </span>
        </div>
        <CloseButton size="sm" onClick={onClose} />
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {loading && !pinsLoaded ? (
          <PinnedListSkeleton />
        ) : pins.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-fg/5 text-muted">
              <PinIcon className="h-6 w-6" />
            </div>
            <p className="text-ds-sm font-medium text-normal">Nenhuma mensagem fixada ainda</p>
            <p className="mt-1 text-ds-xs text-muted">
              Mensagens importantes do canal podem ser fixadas aqui para consulta rápida.
            </p>
          </div>
        ) : (
          pins.map((pin: PinnedMessage) => (
            <PinnedMessageItem
              key={pin.id}
              pin={pin}
              serverId={serverId}
              nicknames={nicknames}
              canModerate={canModerate}
              onJump={handleJump}
              onUnpin={(id) => void handleUnpin(id)}
            />
          ))
        )}
      </div>
    </div>
  )
}
