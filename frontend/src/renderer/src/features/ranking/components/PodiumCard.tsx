import Avatar from '../../../shared/ui/Avatar'
import StyledName from '../../profile/components/StyledName'
import { profileCardHandler } from '../../profile/store/profileCardStore'
import { cardContact, formatXp, positionLabel, type PodiumSlot } from '../lib/ranking'
import LevelChip from './LevelChip'

// Por colocação: tamanho do avatar, altura do degrau e cor do destaque.
const PLACE = {
  1: { avatar: 72, step: 'h-24', ring: 'ring-warning', text: 'text-warning' },
  2: { avatar: 56, step: 'h-16', ring: 'ring-fg/50', text: 'text-secondary' },
  3: { avatar: 56, step: 'h-12', ring: 'ring-warning/60', text: 'text-warning/70' }
} as const

function PodiumCard({ slot }: { slot: PodiumSlot }): React.JSX.Element {
  const { entry, place } = slot
  const look = PLACE[place]
  const name = entry.display_name || entry.username
  const contact = cardContact(entry)
  return (
    <li className="flex min-w-0 flex-1 flex-col items-center justify-end">
      <button
        type="button"
        onClick={profileCardHandler(
          entry.user_id,
          name,
          contact.username,
          'top',
          contact.relationship
        )}
        className="flex w-full min-w-0 cursor-pointer flex-col items-center gap-1 rounded-xl px-1 py-2 transition-colors hover:bg-fg/5 focus-ring"
      >
        <span className={`rounded-full ring-2 ring-offset-2 ring-offset-transparent ${look.ring}`}>
          <Avatar
            userId={entry.user_id}
            name={name}
            avatarUrl={entry.avatar_url}
            decorationUrl={entry.avatar_decoration_url}
            size={look.avatar}
          />
        </span>
        <span className="w-full min-w-0 truncate text-center text-ds-sm font-semibold text-strong">
          <StyledName name={name} userId={entry.user_id} style={entry.name_style} />
        </span>
        <LevelChip level={entry.level} />
        <span className="text-ds-xs text-muted">{formatXp(entry.xp)}</span>
      </button>
      <div
        className={`flex w-full items-center justify-center rounded-t-lg bg-fg/5 text-ds-xl font-bold ${look.step} ${look.text}`}
        aria-label={`${place}º lugar`}
      >
        {positionLabel(place)}
      </div>
    </li>
  )
}

export default PodiumCard
