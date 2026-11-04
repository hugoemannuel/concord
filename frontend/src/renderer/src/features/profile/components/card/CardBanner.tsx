import type { CSSProperties } from 'react'
import { PencilIcon } from '../../../../shared/ui/icons'
import { Skeleton } from '../../../../shared/ui/skeleton/Skeleton'

/** Sem imagem: a cor escolhida ou o gradiente padrão (cargo/nível). */
function bannerStyle(
  src: string | null,
  color: string | null | undefined,
  fallback: string
): CSSProperties | undefined {
  if (src) return undefined
  return color ? { background: color } : { backgroundImage: fallback }
}

/** Banner do cartão: imagem/GIF, cor escolhida ou o gradiente padrão. */
export default function CardBanner({
  src,
  color,
  fallback,
  loading,
  surface,
  onEdit
}: {
  src: string | null
  color?: string | null
  fallback: string
  loading: boolean
  surface: string
  onEdit?: () => void
}): React.JSX.Element {
  return (
    <div
      data-card-banner={src ? 'image' : 'plain'}
      className={`group/banner relative overflow-hidden rounded-t-[10px] ${src ? 'h-[106px]' : 'h-16'}`}
      style={bannerStyle(src, color, fallback)}
    >
      {src && <img src={src} alt="" draggable={false} className="h-full w-full object-cover" />}
      {loading && !src && !color && (
        // Opaco: o degradê de cargo por baixo ainda não vale (o perfil pode ter banner).
        <div className="h-full w-full" style={{ background: surface }}>
          <Skeleton className="h-full w-full rounded-none" />
        </div>
      )}
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label="Alterar banner"
          title="Alterar banner"
          className="group/edit absolute inset-0 cursor-pointer outline-none"
        >
          <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white shadow-lg ring-white/70 transition-opacity group-focus-visible/edit:ring-2 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/banner:opacity-100 [@media(hover:hover)]:group-focus-visible/edit:opacity-100">
            <PencilIcon className="h-4 w-4" />
          </span>
        </button>
      )}
    </div>
  )
}
