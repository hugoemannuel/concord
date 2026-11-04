import { TagBadgeIcon } from '../../../shared/ui/icons'
import type { ServerTag } from '../api/serverProfile'
import { useUserServerTag } from '../hooks/useUserServerTag'
import { useServerCardStore } from '../store/serverCardStore'

const CHIP =
  'inline-flex shrink-0 items-center gap-0.5 rounded bg-fg/10 px-1 py-px text-ds-xxs font-bold leading-tight text-strong'

/** O emblema na cor do servidor e o nome, como o chip aparece ao lado do nome. */
export function ServerTagLabel({ tag }: { tag: Pick<ServerTag, 'name' | 'badge' | 'color'> }): React.JSX.Element {
  return (
    <>
      <span style={{ color: tag.color }} className="flex shrink-0">
        <TagBadgeIcon badge={tag.badge} size={12} />
      </span>
      <span>{tag.name}</span>
    </>
  )
}

/** O chip que abre o cartão do servidor (a área de toque passa do desenho). */
export function ServerTagChip({ tag, className = '' }: { tag: ServerTag; className?: string }): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={`Tag do servidor: ${tag.name}. Abrir o cartão do servidor`}
      title={`Tag do servidor: ${tag.name}`}
      onClick={(e) => {
        // Na lista de membros e no chat, a linha abre o perfil da pessoa.
        e.stopPropagation()
        useServerCardStore.getState().open(tag.server_id)
      }}
      className={`${CHIP} focus-ring relative cursor-pointer transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-fg/20 ${className}`}
    >
      <ServerTagLabel tag={tag} />
    </button>
  )
}

/** Sem clique: a prévia das configurações. */
export function ServerTagPreview({ tag }: { tag: Pick<ServerTag, 'name' | 'badge' | 'color'> }): React.JSX.Element {
  return (
    <span className={CHIP}>
      <ServerTagLabel tag={tag} />
    </span>
  )
}

/** A tag que a pessoa usa, ao lado do nome dela em qualquer lugar. */
export default function UserServerTag({
  userId,
  className
}: {
  userId: string | undefined
  className?: string
}): React.JSX.Element | null {
  const tag = useUserServerTag(userId)
  return tag ? <ServerTagChip tag={tag} className={className} /> : null
}
