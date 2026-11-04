import { useState } from 'react'
import { useStickerSrc } from '../hooks/useStickerSrc'
import ExpressionOriginCard from '../../emojis/components/ExpressionOriginCard'

interface MessageStickerProps {
  sticker: {
    id: string
    server_id: string
    name: string
    content_type: string
  }
}

/** Figurinha na mensagem: clicar mostra de que servidor ela veio. Sem a imagem, fica o :nome:. */
export default function MessageSticker({ sticker }: MessageStickerProps): React.JSX.Element {
  const src = useStickerSrc(sticker.id)
  const [failed, setFailed] = useState(false)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const label = `:${sticker.name}:`

  if (failed) return <p className="text-ds-chat text-muted">{label}</p>

  return (
    <div className="group relative my-1 inline-block select-none" title={label}>
      {src ? (
        <button
          type="button"
          aria-label={label}
          aria-haspopup="dialog"
          data-message-media
          onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
          className="focus-ring block cursor-pointer rounded-lg"
        >
          <img
            src={src}
            alt={sticker.name}
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setFailed(true)}
            className="h-36 w-36 object-contain transition-transform duration-150 hover:scale-105"
          />
        </button>
      ) : (
        <div className="h-36 w-36 animate-pulse rounded-lg bg-white/5" />
      )}
      <span className="pointer-events-none absolute -bottom-5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 text-ds-xxs text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
        {label}
      </span>
      {anchor && src && (
        <ExpressionOriginCard
          kind="sticker"
          id={sticker.id}
          name={sticker.name}
          media={<img src={src} alt="" className="h-full w-full object-contain" />}
          anchor={anchor}
          onClose={() => setAnchor(null)}
        />
      )}
    </div>
  )
}
