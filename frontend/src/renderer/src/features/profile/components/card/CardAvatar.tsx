import Avatar from '../../../../shared/ui/Avatar'
import { PencilIcon } from '../../../../shared/ui/icons'
import type { PresenceStatus } from '../../../friends/lib/presenceStatus'

/**
 * Avatar do cartão, com o anel na cor do fundo. No próprio perfil, o "Editar
 * perfil" por cima; na prévia do editor, o lápis que troca a imagem.
 */
export default function CardAvatar({
  userId,
  name,
  avatarUrl,
  decorationUrl,
  status,
  surface,
  fallbackClassName,
  onEditProfile,
  onEdit
}: {
  /** Sem id (prévia): não usa o profileStore e mostra o rascunho. */
  userId?: string
  name: string
  avatarUrl?: string | null
  decorationUrl?: string | null
  status?: PresenceStatus | null
  surface: string
  fallbackClassName?: string
  onEditProfile?: () => void
  onEdit?: () => void
}): React.JSX.Element {
  return (
    <div
      className="pt-ink-keep pointer-events-auto relative shrink-0 rounded-full p-1.5"
      style={{ background: surface }}
    >
      <Avatar
        userId={userId}
        name={name}
        avatarUrl={avatarUrl}
        decorationUrl={decorationUrl}
        size={80}
        animate="always"
        status={status}
        cutoutColor={surface}
        fallbackClassName={fallbackClassName}
      />
      {onEditProfile && (
        <button
          type="button"
          onClick={onEditProfile}
          aria-label="Editar perfil"
          className="absolute inset-1.5 flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-full bg-black/60 text-ds-xxs font-bold uppercase text-white opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 on-media"
        >
          <PencilIcon className="h-4 w-4" />
          Editar perfil
        </button>
      )}
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label="Alterar avatar"
          title="Alterar avatar"
          className="group/avatar absolute inset-1.5 cursor-pointer rounded-full outline-none focus-ring"
        >
          {/* Com mouse: o véu com o lápis no hover/foco. No toque: o lápis no canto, sempre. */}
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity [@media(hover:hover)]:group-hover/avatar:opacity-100 [@media(hover:hover)]:group-focus-visible/avatar:opacity-100">
            <PencilIcon className="h-5 w-5 drop-shadow" />
          </span>
          <span className="absolute -right-0.5 top-0 flex size-7 items-center justify-center rounded-full bg-black/70 text-white shadow ring-2 ring-white/20 [@media(hover:hover)]:hidden">
            <PencilIcon className="size-3.5" />
          </span>
        </button>
      )}
    </div>
  )
}
