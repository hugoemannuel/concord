import { useCallStore } from '../../call/store/callStore'
import { knockView } from '../lib/voiceChannelRow'
import { LockIcon, XIcon } from '../../../shared/ui/icons'
import CloseButton from '../../../shared/ui/CloseButton'

interface VoiceKnockOverlayProps {
  channelId: string
  locked: boolean
  connectedHere: boolean
  /** Pedir para entrar (o mesmo clique do canal). */
  onJoin: () => void
}

/** Sala trancada e eu fora dela: pedir para entrar, pedido enviado ou recusado. */
function VoiceKnockOverlay({
  channelId,
  locked,
  connectedHere,
  onJoin
}: VoiceKnockOverlayProps): React.JSX.Element | null {
  const knock = useCallStore((s) => knockView(s.knock, channelId))
  const cancelJoinRequest = useCallStore((s) => s.cancelJoinRequest)
  if (!locked || connectedHere) return null
  if (knock === 'pending') {
    return (
      <div className="absolute inset-0 z-10 flex items-center justify-between rounded-lg bg-black/80 px-2.5 backdrop-blur-sm border border-warning/40 animate-in on-media fade-in duration-150">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="h-2 w-2 shrink-0 animate-ping rounded-full bg-warning" />
          <span className="truncate text-ds-xs font-semibold text-warning">Pedido enviado…</span>
        </div>
        <CloseButton
          variant="filled"
          size="xs"
          label="Cancelar pedido"
          onClick={(e) => {
            e.stopPropagation()
            cancelJoinRequest()
          }}
        />
      </div>
    )
  }
  if (knock === 'declined') {
    return (
      <div className="absolute inset-0 z-10 flex items-center gap-1.5 rounded-lg bg-black/80 px-2.5 backdrop-blur-sm border border-danger/40 animate-in fade-in duration-150 on-media">
        <XIcon className="h-3.5 w-3.5 text-danger shrink-0" />
        <span className="truncate text-ds-xs font-medium text-danger">Pedido recusado</span>
      </div>
    )
  }
  return (
    <div
      onClick={onJoin}
      className="pointer-events-none group-hover/voicech:pointer-events-auto absolute inset-0 z-10 flex items-center justify-center gap-1.5 rounded-lg bg-black/80 px-2 opacity-0 backdrop-blur-xs transition-opacity group-hover/voicech:opacity-100 cursor-pointer border border-warning/20 on-media"
    >
      <LockIcon className="h-3.5 w-3.5 text-warning shrink-0" />
      <span className="truncate text-ds-xs font-semibold text-warning">
        Sala trancada · Pedir permissão
      </span>
    </div>
  )
}

export default VoiceKnockOverlay
