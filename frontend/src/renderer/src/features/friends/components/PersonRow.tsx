import { usePresenceStatus } from '../../chat/store/chatStore'
import { useUserLook } from '../../profile/store/profileStore'
import Avatar from '../../../shared/ui/Avatar'
import StyledName from '../../profile/components/StyledName'
import type { NameStyle } from '../../profile/lib/nameStyle'
import { rowInteraction } from '../lib/rowInteraction'

export const MAIN_BG = 'var(--bg-primary)'

const ROW_TONE_HOVER = {
  default: 'hover:text-strong',
  accept: 'hover:text-success',
  deny: 'hover:text-danger'
} as const

/** Botão redondo de ação da linha (Mensagem, Mais, Aceitar...). */
export function RowAction({
  label,
  onClick,
  tone = 'default',
  children
}: {
  label: string
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  tone?: keyof typeof ROW_TONE_HOVER
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onClick(e)
      }}
      className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-floating text-muted transition-colors ${ROW_TONE_HOVER[tone]}`}
    >
      {children}
    </button>
  )
}

export interface RowUser {
  id: string
  username: string
  display_name?: string
  avatar_url?: string | null
  avatar_decoration_url?: string | null
  name_style?: NameStyle
}

/** Linha da lista (avatar + nome + subtítulo), com as ações à direita. */
export function PersonRow({
  user,
  subtitle,
  showStatus,
  onClick,
  onContextMenu,
  children
}: {
  user: RowUser
  subtitle: React.ReactNode
  showStatus: boolean
  onClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  children: React.ReactNode
}): React.JSX.Element {
  const status = usePresenceStatus(user.id)
  const look = useUserLook(user.id, {
    name: user.display_name || user.username,
    avatarUrl: user.avatar_url,
    decorationUrl: user.avatar_decoration_url
  })
  const { className, ...interaction } = rowInteraction(onClick)
  return (
    <div
      {...interaction}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`group mx-[-10px] flex items-center gap-3 rounded-lg border-t border-subtle px-2.5 py-2.5 transition-colors hover:border-transparent hover:bg-fg/5 ${className}`}
    >
      <Avatar
        userId={user.id}
        name={look.name}
        avatarUrl={look.avatarUrl}
        decorationUrl={look.decorationUrl}
        size={32}
        status={showStatus ? status : null}
        cutoutColor={MAIN_BG}
      />
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-1.5 truncate text-ds-md font-semibold text-strong">
          <StyledName name={look.name} userId={user.id} style={user.name_style} />
          <span className="hidden truncate text-ds-sm font-normal text-muted group-hover:inline">
            {user.username}
          </span>
        </p>
        <p className="truncate text-ds-sm text-muted">{subtitle}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">{children}</div>
    </div>
  )
}
