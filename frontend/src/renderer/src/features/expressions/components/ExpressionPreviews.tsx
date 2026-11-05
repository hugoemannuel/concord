import { useStickerSrc } from '../../chat/hooks/useStickerSrc'
import { Skeleton } from '../../../shared/ui/skeleton/Skeleton'
import { SoundboardIcon } from '../../../shared/ui/icons'

/** A figurinha em miniatura (o espaço fica guardado até o media token chegar). */
export function StickerThumb({ id, name }: { id: string; name: string }): React.JSX.Element {
  const src = useStickerSrc(id)
  if (!src) return <Skeleton className="size-12 rounded-md" />
  return (
    <img
      src={src}
      alt={name}
      width={48}
      height={48}
      loading="lazy"
      decoding="async"
      draggable={false}
      className="size-12 object-contain"
    />
  )
}

/** O emoji do som (conteúdo do usuário) ou, sem ele, o ícone da mesa de áudio. */
export function SoundThumb({ emoji }: { emoji?: string | null }): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="flex size-10 items-center justify-center rounded-md bg-fg/5 text-ds-xl text-muted"
    >
      {emoji || <SoundboardIcon size={24} />}
    </span>
  )
}
