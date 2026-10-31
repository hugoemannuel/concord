import { CalendarIcon } from '../../../shared/ui/icons'
import { useBannerSrc } from '../hooks/useBannerSrc'

/** Banner 16:9 do evento; sem imagem, o degradê da marca com um calendário. */
export default function EventBanner({
  bannerId,
  className = ''
}: {
  bannerId: string | null
  className?: string
}): React.JSX.Element {
  const { src, onError } = useBannerSrc(bannerId)
  return (
    <div className={`relative aspect-video w-full overflow-hidden bg-gradient-hero ${className}`}>
      {src ? (
        // Decorativo: o título do evento já está no texto ao lado.
        <img
          src={src}
          alt=""
          width={1280}
          height={720}
          loading="lazy"
          onError={onError}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-white/80">
          <CalendarIcon size={24} />
        </span>
      )}
    </div>
  )
}
