import type { CallUserInfo } from '../store/callStore'
import StreamAudioControls from './StreamAudioControls'
import FullscreenOverlay from './FullscreenOverlay'

/** Controles do vídeo do tile: barra de volume/tela cheia ao passar o mouse, ou a barra da tela cheia. */
export default function TileVideoControls({
  inFullscreen,
  user,
  streamAudioUserId,
  canFullscreen,
  toggleFullscreen,
  watchers
}: {
  inFullscreen: boolean
  user: CallUserInfo
  /** Live de outra pessoa: volume da transmissão (só para você). */
  streamAudioUserId?: string
  canFullscreen: boolean
  toggleFullscreen: () => void
  watchers?: CallUserInfo[]
}): React.JSX.Element | null {
  if (inFullscreen) {
    return (
      <FullscreenOverlay
        name={user.display_name}
        userId={streamAudioUserId}
        onExit={toggleFullscreen}
        watchers={watchers}
      />
    )
  }
  if (!streamAudioUserId && !canFullscreen) return null
  return (
    <StreamAudioControls
      userId={streamAudioUserId}
      onToggleFullscreen={canFullscreen ? toggleFullscreen : undefined}
    />
  )
}
