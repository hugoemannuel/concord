import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fitFrame, runCrop } from '../../profile/lib/cropView'
import {
  AVATAR_OUTPUT,
  BANNER_OUTPUT,
  DECORATION_OUTPUT,
  NAMEPLATE_OUTPUT,
  type Point,
  type Size
} from '../../profile/lib/imageCrop'
import type { MediaChange } from '../../profile/lib/profileValidation'
import { CropFooter, ZoomSlider } from './CropControls'
import CropViewport from './CropViewport'

export type ImageKind = 'avatar' | 'banner' | 'nameplate' | 'decoration'

/** Quadro do recorte na tela (o banner tem a proporção do Discord, 17:6; a faixa, 6:1). */
const FRAME: Record<ImageKind, Size> = {
  avatar: { width: 300, height: 300 },
  banner: { width: 476, height: 168 },
  nameplate: { width: 480, height: 80 },
  decoration: { width: 300, height: 300 }
}
const OUTPUT: Record<ImageKind, Size> = {
  avatar: AVATAR_OUTPUT,
  banner: BANNER_OUTPUT,
  nameplate: NAMEPLATE_OUTPUT,
  decoration: DECORATION_OUTPUT
}
const ORIGIN: Point = { x: 0, y: 0 }

/** ESC fecha só o recorte, não as Configurações por trás (captura + preventDefault). */
function useEscapeToCancel(onCancel: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      onCancel()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onCancel])
}

/**
 * "Editar imagem" do Discord: arrastar e zoom antes de aplicar. GIF também
 * recorta: cada quadro é recortado e a animação continua.
 */
function ImageCropModal({
  file,
  src,
  kind,
  onCancel,
  onApply
}: {
  file: File
  /** URL local do arquivo (quem abre cria e libera). */
  src: string
  kind: ImageKind
  onCancel: () => void
  onApply: (change: Extract<MediaChange, { kind: 'set' }>) => void
}): React.JSX.Element {
  const [frame] = useState(() => fitFrame(FRAME[kind], window.innerWidth))
  const [natural, setNatural] = useState<Size | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState<Point>(ORIGIN)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  useEscapeToCancel(onCancel)

  const apply = (): void => {
    if (!natural || !imgRef.current) return
    setBusy(true)
    setError(null)
    const fail = (message: string): void => {
      setError(message)
      setBusy(false)
    }
    const request = { file, image: imgRef.current, natural, frame, zoom, offset, out: OUTPUT[kind] }
    void runCrop(request, onApply, fail)
  }

  return createPortal(
    <div
      className="app-no-drag fixed inset-x-0 bottom-0 z-[70] flex items-center justify-center bg-black/70 p-4"
      style={{ top: 'var(--titlebar-height, 0px)' }}
      onMouseDown={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Editar imagem"
        className="max-h-full w-full max-w-[540px] overflow-y-auto rounded-xl border border-subtle bg-floating shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5">
          <h2 className="text-ds-lg font-bold text-strong">Editar imagem</h2>
        </div>
        <CropViewport
          round={kind === 'avatar'}
          frame={frame}
          src={src}
          natural={natural}
          zoom={zoom}
          offset={offset}
          imgRef={imgRef}
          onNatural={setNatural}
          onOffset={setOffset}
          onImageError={() => setError('Não foi possível abrir essa imagem.')}
        />
        <ZoomSlider zoom={zoom} onZoom={setZoom} />
        {error && <p className="px-6 pt-3 text-ds-xs text-danger">{error}</p>}
        <CropFooter
          busy={busy}
          canApply={natural !== null}
          onReset={() => {
            setZoom(1)
            setOffset(ORIGIN)
          }}
          onCancel={onCancel}
          onApply={apply}
        />
      </div>
    </div>,
    document.body
  )
}

export default ImageCropModal
