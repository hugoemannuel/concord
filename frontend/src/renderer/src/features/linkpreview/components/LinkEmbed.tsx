import CloseButton from '../../../shared/ui/CloseButton'
import { linkPreviewImageUrl, type LinkPreview } from '../api/linkPreviews'
import { safeEmbedColor } from '../lib/embedView'
import YouTubeEmbed from './YouTubeEmbed'

// O X: sempre visível no toque; com mouse, aparece no hover ou no foco do teclado.
const REMOVE_REVEAL =
  'absolute right-1 top-1 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/embed:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100'

/** A imagem grande do cartão (ou o player, se for vídeo do YouTube). */
function EmbedMedia({ preview }: { preview: LinkPreview }): React.JSX.Element | null {
  if (preview.youtube_id) return <YouTubeEmbed preview={preview} />
  if (!preview.image_id) return null
  return (
    <img
      src={linkPreviewImageUrl(preview.image_id)}
      alt=""
      loading="lazy"
      className="h-auto w-full max-w-[25rem] rounded-lg"
    />
  )
}

/**
 * Cartão de prévia de um link, como no Discord: faixa na cor do site, nome do
 * site, título (abre fora, como os links do texto), descrição e imagem. O X
 * (onRemove) só vem para o autor da mensagem.
 */
export default function LinkEmbed({
  preview,
  onRemove
}: {
  preview: LinkPreview
  onRemove?: () => void
}): React.JSX.Element {
  const color = safeEmbedColor(preview.color)
  return (
    <article
      style={color ? { borderLeftColor: color } : undefined}
      className={`group/embed relative mt-1 flex w-full min-w-0 max-w-[27rem] flex-col gap-2 rounded border-l-4 border-strong bg-secondary p-3 ${
        onRemove ? 'pr-10' : ''
      }`}
    >
      {preview.site_name && <p className="truncate text-ds-xs text-muted">{preview.site_name}</p>}
      {preview.title && (
        <a
          href={preview.url}
          target="_blank"
          rel="noopener noreferrer"
          className="break-words text-ds-md font-semibold text-link hover:underline focus-ring"
        >
          {preview.title}
        </a>
      )}
      {preview.description && (
        <p className="line-clamp-3 whitespace-pre-line break-words text-ds-sm text-normal">
          {preview.description}
        </p>
      )}
      <EmbedMedia preview={preview} />
      {onRemove && (
        <CloseButton label="Remover prévias" size="sm" className={REMOVE_REVEAL} onClick={onRemove} />
      )}
    </article>
  )
}
