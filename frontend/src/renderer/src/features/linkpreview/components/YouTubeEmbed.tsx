import { useState } from 'react'
import { PlayIcon } from '../../../shared/ui/icons'
import { linkPreviewImageUrl, type LinkPreview } from '../api/linkPreviews'
import { youtubeEmbedSrc } from '../lib/embedView'

const FRAME = 'aspect-video w-full max-w-[25rem] rounded-lg'

/**
 * Vídeo do YouTube no chat, como no Discord: a miniatura (pelo nosso
 * servidor) com o play; o clique troca pelo player, que só carrega aí.
 */
export default function YouTubeEmbed({ preview }: { preview: LinkPreview }): React.JSX.Element | null {
  const [playing, setPlaying] = useState(false)
  const src = youtubeEmbedSrc(preview.youtube_id)
  if (!src) return null
  if (playing) {
    return (
      <iframe
        src={src}
        title={preview.title || preview.url}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className={`${FRAME} border-0 bg-black`}
      />
    )
  }
  return (
    // Área clicável (a miniatura inteira), não um botão com cara de botão.
    <button
      type="button"
      aria-label="Reproduzir vídeo"
      onClick={() => setPlaying(true)}
      className={`${FRAME} group/play relative block cursor-pointer overflow-hidden bg-black focus-ring`}
    >
      {preview.image_id && (
        <img
          src={linkPreviewImageUrl(preview.image_id)}
          alt=""
          loading="lazy"
          className="size-full object-cover"
        />
      )}
      <span className="absolute inset-0 m-auto flex size-12 items-center justify-center rounded-full bg-black/70 text-white transition-colors group-hover/play:bg-danger-strong">
        <PlayIcon size={24} aria-hidden />
      </span>
    </button>
  )
}
