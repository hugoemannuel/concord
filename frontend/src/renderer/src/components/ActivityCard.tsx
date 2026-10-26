import { useState } from 'react'
import { gameAccent } from '../../../shared/gameCatalog'
import { activityElapsed, type PresenceActivity } from '../lib/presenceActivity'
import type { NameStyle } from '../lib/nameStyle'
import { useUserLook } from '../store/profileStore'
import Avatar from './Avatar'
import GameIcon from './GameIcon'
import StyledName from './StyledName'

/** "há 5 min": o tempo é lido uma vez por montagem (o cartão reabre a cada visita). */
export function Elapsed({ startedAt }: { startedAt: number }): React.JSX.Element {
  const [now] = useState(() => Date.now())
  return <>{activityElapsed(startedAt, now)}</>
}

/** Card da coluna "Atividade": amigo, jogo em destaque e há quanto tempo. */
export function ActivityCard({
  user,
  activity,
  onClick
}: {
  user: {
    id: string
    username: string
    display_name?: string
    avatar_url?: string | null
    name_style?: NameStyle
  }
  activity: PresenceActivity
  onClick?: () => void
}): React.JSX.Element {
  const accent = gameAccent(activity.name) ?? '#5865f2'
  const look = useUserLook(user.id, {
    name: user.display_name || user.username,
    avatarUrl: user.avatar_url
  })
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-white/6 bg-[#111214] p-3 text-left transition-colors hover:bg-white/5"
    >
      <Avatar
        userId={user.id}
        name={look.name}
        avatarUrl={look.avatarUrl}
        size={32}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-ds-sm font-medium text-gray-400">
          <StyledName name={look.name} userId={user.id} style={user.name_style} />
        </p>
        <p className="truncate text-ds-md font-bold text-white">{activity.name}</p>
        <p className="truncate text-ds-xs text-gray-400">
          <Elapsed startedAt={activity.started_at} />
        </p>
      </div>
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md"
        style={{ background: `${accent}33`, color: accent }}
      >
        <GameIcon name={activity.name} appId={activity.app_id} iconHash={activity.icon_hash} className="h-6 w-6" />
      </span>
    </button>
  )
}
