import { API_BASE_URL } from '../../../shared/lib/config'
import { LockIcon } from '../../../shared/ui/icons'
import GameIcon from '../../activity/components/GameIcon'
import { formatInviteCount } from '../../servers/lib/invitePreview'
import { serverIconSrc } from '../../servers/lib/serverIcon'
import type { ServerArt, ServerCard, ServerGame, ServerTrait } from '../api/serverProfile'
import { artBackground } from '../lib/serverArt'
import { createdLabel } from '../lib/serverCardText'
import { ServerTagPreview } from './ServerTagChip'

const NO_ART: ServerArt = { preset: '', image: '' }

function CardIcon({ name, iconUrl, locked }: { name?: string; iconUrl?: string | null; locked: boolean }): React.JSX.Element {
  const src = serverIconSrc(iconUrl)
  if (locked) return <LockIcon size={24} />
  if (src) return <img src={src} alt="" className="h-full w-full object-cover" />
  return <span aria-hidden="true">{(name ?? '?').charAt(0).toUpperCase()}</span>
}

/** O banner com o ícone do servidor por cima. */
function CardTop({
  art,
  name,
  iconUrl,
  locked = false
}: {
  art: ServerArt
  name?: string
  iconUrl?: string | null
  locked?: boolean
}): React.JSX.Element {
  return (
    <>
      <div className="h-24 w-full" style={artBackground(art, API_BASE_URL)} aria-hidden="true" />
      <div className="relative -mt-8 ml-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl bg-gradient-brand text-ds-lg font-bold text-white ring-4 ring-[var(--bg-floating)]">
        <CardIcon name={name} iconUrl={iconUrl} locked={locked} />
      </div>
    </>
  )
}

function TraitChips({ traits }: { traits: ServerTrait[] }): React.JSX.Element | null {
  if (traits.length === 0) return null
  return (
    <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Traços do servidor">
      {traits.map((trait) => (
        <li
          key={`${trait.emoji}${trait.text}`}
          className="flex min-w-0 items-center gap-1 rounded-md bg-fg/10 px-2 py-0.5 text-ds-xs text-normal"
        >
          {trait.emoji && <span aria-hidden="true">{trait.emoji}</span>}
          <span className="truncate">{trait.text}</span>
        </li>
      ))}
    </ul>
  )
}

function GameRows({ games }: { games: ServerGame[] }): React.JSX.Element | null {
  if (games.length === 0) return null
  return (
    <ul className="mt-3 flex flex-col gap-1.5" aria-label="Jogos em destaque">
      {games.map((game) => (
        <li key={game.name} className="flex min-w-0 items-center gap-2 text-ds-sm font-medium text-strong">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-fg/10 text-muted">
            <GameIcon name={game.name} appId={game.app_id} iconHash={game.icon_hash} />
          </span>
          <span className="truncate">{game.name}</span>
        </li>
      ))}
    </ul>
  )
}

const CARD = 'w-full min-w-0 overflow-hidden rounded-lg border border-subtle bg-floating text-left'

/** Perfil privado: só isso, para quem está fora e não tem convite. */
export function LockedServerCard(): React.JSX.Element {
  return (
    <article className={CARD}>
      <CardTop art={NO_ART} locked />
      <div className="px-4 pb-4 pt-2">
        <h2 className="text-ds-lg font-bold text-strong">Servidor privado</h2>
        <p className="mt-1 text-ds-sm text-secondary">Este servidor limitou quem pode ver o perfil dele.</p>
      </div>
    </article>
  )
}

/** O cartão do servidor, como aparece para os outros (convite, tag, prévia). */
export default function ServerCardView({ card }: { card: ServerCard }): React.JSX.Element {
  if (card.locked || !card.profile) return <LockedServerCard />
  const { profile } = card
  const created = createdLabel(card.created_at)
  return (
    <article className={CARD}>
      <CardTop art={profile.banner} name={card.name} iconUrl={card.icon_url} />
      <div className="px-4 pb-4 pt-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <h2 className="min-w-0 break-words text-ds-lg font-bold text-strong">{card.name}</h2>
          {profile.tag && <ServerTagPreview tag={profile.tag} />}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-ds-xs text-secondary">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
            {formatInviteCount(card.online_count, 'online', 'online')}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-fg/40" aria-hidden="true" />
            {formatInviteCount(card.member_count, 'membro', 'membros')}
          </span>
        </div>
        {created && <p className="mt-0.5 text-ds-xs text-muted">{created}</p>}
        {profile.description && (
          <p className="mt-3 whitespace-pre-line break-words text-ds-sm text-normal">{profile.description}</p>
        )}
        <TraitChips traits={profile.traits} />
        <GameRows games={profile.games} />
      </div>
    </article>
  )
}

