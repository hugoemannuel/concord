import { useRef } from 'react'
import { DECORATION_SCALE } from '../../profile/lib/cosmetics'
import { dragOffset, imagePlacement, type Drag } from '../../profile/lib/cropView'
import type { Point, Size } from '../../profile/lib/imageCrop'

/** Quadro do recorte: a imagem (GIF anima) que se arrasta por baixo da moldura. */
function CropViewport({
  round,
  cutout = false,
  frame,
  src,
  natural,
  zoom,
  offset,
  imgRef,
  onNatural,
  onOffset,
  onImageError
}: {
  /** Avatar é redondo; banner, retangular. */
  round: boolean
  /** Moldura do avatar: demarca a área circular central que não sobrepõe o avatar. */
  cutout?: boolean
  frame: Size
  src: string
  natural: Size | null
  zoom: number
  offset: Point
  imgRef: React.RefObject<HTMLImageElement | null>
  onNatural: (size: Size) => void
  onOffset: (offset: Point) => void
  onImageError: () => void
}): React.JSX.Element {
  const drag = useRef<Drag | null>(null)

  const start = (e: React.PointerEvent): void => {
    if (!natural) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { start: { x: e.clientX, y: e.clientY }, from: offset }
  }
  const move = (e: React.PointerEvent): void => {
    if (!drag.current || !natural) return
    onOffset(dragOffset(natural, frame, zoom, drag.current, { x: e.clientX, y: e.clientY }))
  }
  const end = (): void => {
    drag.current = null
  }

  return (
    <div className="mt-4 flex justify-center bg-black/40 py-6">
      <div
        className={`relative max-w-full cursor-grab overflow-hidden active:cursor-grabbing ${
          round ? 'rounded-full' : 'rounded-lg'
        }`}
        style={{
          width: frame.width,
          height: frame.height,
          touchAction: 'none',
          borderRadius: cutout ? 16 : undefined
        }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <img
          ref={imgRef}
          src={src}
          alt=""
          draggable={false}
          onLoad={(e) =>
            onNatural({
              width: e.currentTarget.naturalWidth,
              height: e.currentTarget.naturalHeight
            })
          }
          onError={onImageError}
          className="absolute max-w-none select-none"
          style={natural ? imagePlacement(natural, frame, zoom, offset) : undefined}
        />
        {cutout && (
          <div
            data-crop-cutout
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/70 bg-black/60"
            style={{
              width: Math.round(frame.width / DECORATION_SCALE),
              height: Math.round(frame.height / DECORATION_SCALE)
            }}
          />
        )}
      </div>
    </div>
  )
}

export default CropViewport
