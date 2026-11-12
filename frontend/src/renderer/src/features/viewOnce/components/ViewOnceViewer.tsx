import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { trapTab } from '../../../shared/lib/focusTrap'
import Button from '../../../shared/ui/Button'
import CloseButton from '../../../shared/ui/CloseButton'
import Modal from '../../../shared/ui/Modal'
import { useCallStore } from '../../call/store/callStore'
import type { ViewOnceMedia } from '../../chat/api/messages'
import { useViewOnceFlow, type ViewerOutcome } from '../hooks/useViewOnceFlow'
import { confirmText } from '../lib/viewOnce'

export type { ViewerOutcome }

const SHARING_NOTICE = 'Quem assiste sua tela vê esta janela em preto.'

/** Mídia em tela cheia, sem baixar, copiar nem menu de contexto. */
export function ViewerStage({
  kind,
  src,
  onClose
}: {
  kind: ViewOnceMedia['kind']
  src: string
  onClose: () => void
}): React.JSX.Element {
  const sharing = useCallStore((s) => s.isScreenSharing)
  const showNotice = sharing && typeof window !== 'undefined' && !!window.api
  const stageRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  // O foco entra no X ao abrir (o portal fica no fim do body, longe do teclado).
  useEffect(() => {
    closeRef.current?.focus()
  }, [])
  return createPortal(
    <div
      ref={stageRef}
      role="dialog"
      aria-modal="true"
      aria-label="Visualização única"
      onKeyDown={(e) => trapTab(e, stageRef.current)}
      className="fixed inset-0 z-[60] flex select-none items-center justify-center bg-black"
      onContextMenu={(e) => e.preventDefault()}
    >
      {kind === 'image' ? (
        <img src={src} alt="" draggable={false} className="max-h-full max-w-full object-contain" />
      ) : (
        <video
          src={src}
          controls
          autoPlay
          playsInline
          disablePictureInPicture
          controlsList="nodownload noplaybackrate"
          className="max-h-full max-w-full object-contain"
        />
      )}
      <CloseButton
        ref={closeRef}
        variant="media"
        className="absolute right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))]"
        onClick={onClose}
      />
      {showNotice && (
        <p
          role="status"
          className="absolute inset-x-16 top-[max(1rem,env(safe-area-inset-top))] text-center text-ds-sm text-white"
        >
          {SHARING_NOTICE}
        </p>
      )}
    </div>,
    document.body
  )
}

/** A confirmação da primeira (e única) abertura. */
export function ViewOnceConfirm({
  open,
  kind,
  loading,
  onConfirm,
  onCancel
}: {
  open: boolean
  kind: ViewOnceMedia['kind']
  loading: boolean
  onConfirm: () => void
  onCancel: () => void
}): React.JSX.Element {
  return (
    <Modal open={open} title="Visualização única" onClose={onCancel}>
      <p className="text-ds-md text-normal">{confirmText(kind)}</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button loading={loading} onClick={onConfirm}>
          Ver
        </Button>
      </div>
    </Modal>
  )
}

/** Confirma, abre e mostra a visualização única; avisa o resultado ao fechar. */
function ViewOnceViewer({
  media,
  onDone
}: {
  media: ViewOnceMedia
  onDone: (outcome: ViewerOutcome) => void
}): React.JSX.Element {
  const { state, flow } = useViewOnceFlow(media.id, onDone)
  if (state.src) {
    return <ViewerStage kind={media.kind} src={state.src} onClose={() => flow?.close()} />
  }
  return (
    <ViewOnceConfirm
      open={state.phase === 'confirm' || state.phase === 'loading'}
      kind={media.kind}
      loading={state.phase === 'loading'}
      onConfirm={() => void flow?.confirm()}
      onCancel={() => flow?.cancel()}
    />
  )
}

export default ViewOnceViewer
