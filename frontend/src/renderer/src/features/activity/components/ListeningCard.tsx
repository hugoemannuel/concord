import { useId, useState } from 'react'
import { musicAccent } from '../../../../../shared/musicApps'
import { listeningSummary, type ListeningActivity } from '../lib/listeningActivity'
import type { NameStyle } from '../../profile/lib/nameStyle'
import { useUserLook } from '../../profile/store/profileStore'
import Avatar from '../../../shared/ui/Avatar'
import StyledName from '../../profile/components/StyledName'
import IconButton from '../../../shared/ui/IconButton'
import { ChevronDownIcon } from '../../../shared/ui/icons'
import MusicIcon from './MusicIcon'
import { ListeningActions } from './ListeningActions'

/**
 * Card da coluna "Atividade" para quem está ouvindo música: amigo, faixa e o
 * player. O botão da direita abre "Ouvir também".
 */
export function ListeningCard({
  user,
  listening,
  onClick
}: {
  user: {
    id: string
    username: string
    display_name?: string
    avatar_url?: string | null
    avatar_decoration_url?: string | null
    name_style?: NameStyle
  }
  listening: ListeningActivity
  onClick?: () => void
}): React.JSX.Element {
  const accent = musicAccent(listening.app) ?? '#5865f2'
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const look = useUserLook(user.id, {
    name: user.display_name || user.username,
    avatarUrl: user.avatar_url,
    decorationUrl: user.avatar_decoration_url
  })
  return (
    <div className="rounded-lg border border-subtle bg-floating">
      <div className="flex items-center">
        <button
          type="button"
          onClick={onClick}
          title={listeningSummary(listening)}
          className="focus-ring flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-fg/5"
        >
          <Avatar userId={user.id} name={look.name} avatarUrl={look.avatarUrl} decorationUrl={look.decorationUrl} size={32} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-ds-sm font-medium text-muted">
              <StyledName name={look.name} userId={user.id} style={user.name_style} />
            </p>
            <p className="truncate text-ds-md font-bold text-strong">{listening.title}</p>
            <p className="truncate text-ds-xs text-muted">
              {listening.artist ? `${listening.artist} · ` : ''}
              {listening.app}
            </p>
          </div>
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md"
            style={{ background: `${accent}33` }}
          >
            <MusicIcon app={listening.app} className="h-6 w-6" />
          </span>
        </button>
        <IconButton
          icon={ChevronDownIcon}
          label="Ouvir também"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={() => setOpen((v) => !v)}
          className={`mr-2 shrink-0 ${open ? 'rotate-180' : ''}`}
        />
      </div>
      {open && (
        <div className="px-3 pb-3">
          <ListeningActions listening={listening} id={menuId} />
        </div>
      )}
    </div>
  )
}
