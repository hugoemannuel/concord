import { useState } from 'react'
import GifFavoriteButton from './GifFavoriteButton'
import { gifFromMessage } from '../lib/gifFavorites'
import { useGifFavorites } from '../hooks/useGifFavorites'

interface MessageGifProps {
  gifUrl: string
  metadata?: {
    width?: number
    height?: number
    preview_url?: string
  } | null
}

export default function MessageGif({ gifUrl, metadata }: MessageGifProps): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  const gif = gifFromMessage(gifUrl, metadata)
  const { favorites, toggle } = useGifFavorites(gif !== null)
  const favorite = gif !== null && favorites.some((f) => f.id === gif.id)

  if (failed) {
    return (
      <div className="my-1 flex h-32 w-48 items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/5 p-2 text-center text-ds-xs text-faint">
        GIF indisponível
      </div>
    )
  }

  const maxWidth = 300
  const maxHeight = 300

  let widthStyle: number | undefined
  let heightStyle: number | undefined

  if (metadata?.width && metadata?.height) {
    const ratio = metadata.width / metadata.height
    if (ratio > 1) {
      widthStyle = Math.min(metadata.width, maxWidth)
      heightStyle = Math.round(widthStyle / ratio)
    } else {
      heightStyle = Math.min(metadata.height, maxHeight)
      widthStyle = Math.round(heightStyle * ratio)
    }
  }

  return (
    <div
      className="group relative my-1 inline-block overflow-hidden rounded-xl bg-black/30 select-none"
      style={{
        maxWidth: maxWidth,
        maxHeight: maxHeight,
        width: widthStyle,
        height: heightStyle
      }}
    >
      <img
        src={gifUrl}
        alt="GIF"
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
        className="h-full w-full rounded-xl object-cover"
      />
      <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-ds-xxs font-bold tracking-wider text-white uppercase backdrop-blur-md">
        GIF
      </span>
      {gif && (
        <GifFavoriteButton
          gif={gif}
          favorite={favorite}
          onToggle={toggle}
          className="absolute right-1 top-1 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100 aria-pressed:opacity-100"
        />
      )}
    </div>
  )
}
