import type { CallUserInfo } from '../store/callStore'
import { useAnnotationStore } from '../store/annotationStore'
import { HOVER_REVEAL } from '../lib/hoverReveal'
import { PencilIcon, XIcon } from '../../../shared/ui/icons'
import ScreenWatchersOverlay from './ScreenWatchersOverlay'

/**
 * Chips sobre o vídeo da transmissão (espectadores, Desenhar, Ao vivo, fechar).
 * Como a barra de volume, só aparecem com o mouse no tile (`group/tile`).
 */
export default function ScreenTileOverlays({
  user,
  watchers,
  hasHeaderOffset,
  isScreen = true,
  onClose
}: {
  user: CallUserInfo
  watchers?: CallUserInfo[]
  /** Espaço para não cobrir botões do cabeçalho da transmissão focada. */
  hasHeaderOffset: boolean
  isScreen?: boolean
  onClose?: () => void
}): React.JSX.Element {
  const isDrawing = useAnnotationStore((s) => Boolean(s.drawingActive[user.id]))
  const toggleDrawing = useAnnotationStore((s) => s.toggleDrawing)

  return (
    <>
      {isScreen && watchers && watchers.length > 0 && (
        <ScreenWatchersOverlay
          watchers={watchers}
          className={`absolute top-2 ${hasHeaderOffset ? 'left-22' : 'left-2'} ${HOVER_REVEAL}`}
        />
      )}
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5">
        {isScreen && (
          // Desenhando, o botão fica à vista (é o indicador do modo); o X de fechar também.
          <div className={`flex items-center gap-1.5 ${isDrawing ? '' : HOVER_REVEAL}`}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                toggleDrawing(user.id)
              }}
              aria-label="Anotações na transmissão"
              title={isDrawing ? 'Fechar anotações' : 'Anotar / Desenhar na transmissão (Epic Pen)'}
              className={`flex h-6 items-center gap-1 rounded-md px-1.5 text-xs font-semibold backdrop-blur-sm transition-colors cursor-pointer ${
                isDrawing
                  ? 'bg-success-strong text-white shadow-md ring-1 ring-fg/30'
                  : 'bg-black/60 text-gray-200 hover:bg-black/80 hover:text-white on-media'
              }`}
            >
              <PencilIcon className="h-3.5 w-3.5" />
              <span className="text-[11px] font-medium hidden sm:inline">Desenhar</span>
            </button>
            <div className="flex items-center gap-1.5 rounded-md bg-danger-strong px-1.5 py-0.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              <span className="text-[10px] font-bold uppercase tracking-wide text-white">
                Ao vivo
              </span>
            </div>
          </div>
        )}
        {onClose && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            aria-label="Fechar transmissão"
            title="Fechar transmissão"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-black/60 text-gray-200 backdrop-blur-sm transition-colors hover:bg-black/80 hover:text-white on-media"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </>
  )
}
