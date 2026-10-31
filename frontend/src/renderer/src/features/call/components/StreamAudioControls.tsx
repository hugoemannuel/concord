import { streamAudioKey, useUserAudioStore } from '../store/userAudioStore'
import { AnnotationVisibilityButton } from './AnnotationVisibilityButton'
import { FullscreenIcon, VolumeIcon, VolumeOffIcon } from '../../../shared/ui/icons'
import { HOVER_REVEAL } from '../lib/hoverReveal'
import IconButton from '../../../shared/ui/IconButton'

/** Mutar + volume da transmissão só para você (compartilhado com a tela cheia). */
export function StreamVolume({ userId }: { userId: string }): React.JSX.Element {
  const key = streamAudioKey(userId)
  const audio = useUserAudioStore((s) => s.get(key))
  const setVolume = useUserAudioStore((s) => s.setVolume)
  const toggleMuted = useUserAudioStore((s) => s.toggleMuted)
  const volume = Math.round(audio.volume * 100)

  return (
    <>
      <button
        type="button"
        onClick={() => toggleMuted(key)}
        aria-label={audio.muted ? 'Ouvir transmissão' : 'Silenciar transmissão para você'}
        title={audio.muted ? 'Ouvir transmissão' : 'Silenciar só para você'}
        className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-fg/10 ${
          audio.muted ? 'text-danger' : 'text-strong'
        }`}
      >
        {audio.muted ? <VolumeOffIcon className="h-4 w-4" /> : <VolumeIcon className="h-4 w-4" />}
      </button>
      <input
        type="range"
        min={0}
        max={100}
        value={audio.muted ? 0 : volume}
        onChange={(e) => {
          const next = Number(e.target.value)
          if (audio.muted && next > 0) toggleMuted(key)
          setVolume(key, next / 100)
        }}
        aria-label="Volume da transmissão (só para você)"
        title={`Volume: ${audio.muted ? 0 : volume}%`}
        className="h-1 w-20 cursor-pointer accent-brand"
      />
    </>
  )
}

/**
 * Barra que aparece ao passar o mouse no vídeo: mutar e volume da transmissão
 * só para você (os outros continuam ouvindo normalmente; só na live de alguém)
 * e, no canto, o botão de tela cheia. O pai precisa da classe `group/tile`.
 */
function StreamAudioControls({
  userId,
  onToggleFullscreen
}: {
  /** Sem id (câmera): não há volume de transmissão, só a tela cheia. */
  userId?: string
  /** Presente = mostra o botão "Tela cheia" no canto inferior direito. */
  onToggleFullscreen?: () => void
}): React.JSX.Element {
  return (
    <div
      // Arrastar aqui (o volume) não pode arrastar a live no mosaico nem
      // clicar abre o modo foco.
      draggable
      onDragStart={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className={`absolute bottom-2 right-2 z-20 flex items-center gap-2 rounded-lg bg-black/70 px-2 py-1 backdrop-blur-sm ${HOVER_REVEAL} on-media`}
    >
      {userId && (
        <>
          <StreamVolume userId={userId} />
          <AnnotationVisibilityButton sharerId={userId} />
        </>
      )}
      {onToggleFullscreen && (
        <IconButton icon={FullscreenIcon} label="Tela cheia" onClick={onToggleFullscreen} size="sm" />
      )}
    </div>
  )
}

export default StreamAudioControls
