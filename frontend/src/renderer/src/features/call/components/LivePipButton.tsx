import { PictureInPictureIcon } from '../../../shared/ui/icons'
import { HOVER_REVEAL } from '../lib/hoverReveal'
import { pipButtonLabel } from '../lib/livePip'
import { livePipSupported, toggleLivePip } from '../lib/livePipBrowser'
import { useLivePipStore } from '../store/livePipStore'

/** Clique e arrasto aqui não abrem o foco nem arrastam a miniatura. */
const stop = (e: React.SyntheticEvent): void => e.stopPropagation()

export function PipToggle({
  active,
  onToggle
}: {
  active: boolean
  onToggle: () => void
}): React.JSX.Element {
  const label = pipButtonLabel(active)
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      onDoubleClick={stop}
      onPointerDown={stop}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`on-media absolute right-2 top-18 z-20 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full backdrop-blur-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${HOVER_REVEAL} ${
        active
          ? 'bg-brand text-white'
          : 'bg-black/60 text-gray-200 hover:bg-black/80 hover:text-white'
      }`}
    >
      <PictureInPictureIcon size={16} className="h-3.5 w-3.5" />
    </button>
  )
}

/** Botão no canto da live de outra pessoa: abre (ou fecha) a janela flutuante. */
export default function LivePipButton({ userId }: { userId: string }): React.JSX.Element | null {
  const active = useLivePipStore((s) => s.userId === userId)
  if (!livePipSupported()) return null
  return <PipToggle active={active} onToggle={() => void toggleLivePip(userId)} />
}
