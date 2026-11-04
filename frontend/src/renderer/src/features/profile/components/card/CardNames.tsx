import type { ReactNode } from 'react'
import StyledName from '../StyledName'
import type { CardProfile } from '../ProfileCardBody'
import type { CardSpot } from '../../lib/cardSpots'
import EditableSpot from './EditableSpot'
import UserServerTag from '../../../serverprofile/components/ServerTagChip'

/** O nome em destaque: o apelido do servidor ou o nome de exibição estilizado. */
function NameLine({
  profile,
  you
}: {
  profile: CardProfile
  you: boolean
}): React.JSX.Element {
  return (
    <p className="truncate text-ds-lg font-bold text-strong">
      {profile.nickname ? (
        profile.nickname
      ) : (
        <StyledName
          name={profile.display_name || ' '}
          userId={profile.id}
          style={profile.name_style}
        />
      )}
      {you && <span className="ml-1.5 text-ds-xs font-medium text-muted">(você)</span>}
    </p>
  )
}

/** Pronomes; no editor, sem pronomes, o convite para adicionar. */
function Pronouns({ value, placeholder }: { value?: string; placeholder?: string }): React.JSX.Element | null {
  if (value) return <span className="text-muted">{value}</span>
  return placeholder ? <span className="italic text-faint">{placeholder}</span> : null
}

/** "usuario • pronomes", o selo BOT e as badges. */
function SubLine({
  profile,
  badges,
  placeholder
}: {
  profile: CardProfile
  badges?: ReactNode
  /** No editor: o que aparece sem pronomes. */
  placeholder?: string
}): React.JSX.Element | null {
  const { username } = profile
  const pronouns = profile.pronouns || placeholder
  if (!username && !pronouns && !badges) return null
  return (
    <div className="flex min-w-0 items-center gap-2">
      <p className="min-w-0 truncate text-ds-sm text-secondary">
        {username && <span>{username}</span>}
        {username && pronouns && <span className="text-faint"> · </span>}
        <Pronouns value={profile.pronouns} placeholder={placeholder} />
      </p>
      {profile.is_bot && (
        <span className="shrink-0 rounded bg-brand px-1.5 py-px text-ds-xxs font-bold uppercase leading-tight text-white">
          Bot
        </span>
      )}
      {badges}
    </div>
  )
}

/** Nome, nome de verdade (quando há apelido) e a linha do @. */
export default function CardNames({
  profile,
  you,
  badges,
  onEdit,
  pronounsPlaceholder
}: {
  profile: CardProfile
  /** Mostra "(você)" ao lado do nome. */
  you: boolean
  badges?: ReactNode
  /** Prévia do editor: o nome e a linha dos pronomes abrem o modal deles. */
  onEdit?: (spot: CardSpot) => void
  pronounsPlaceholder?: string
}): React.JSX.Element {
  return (
    <div className="mt-2">
      <EditableSpot spot="name" onEdit={onEdit}>
        <NameLine profile={profile} you={you} />
      </EditableSpot>
      {profile.nickname && (
        <p
          className="truncate text-ds-sm font-semibold text-normal"
          title="Nome de exibição (fora deste servidor)"
        >
          <StyledName name={profile.display_name} userId={profile.id} style={profile.name_style} />
        </p>
      )}
      <EditableSpot spot="pronouns" onEdit={onEdit}>
        <SubLine profile={profile} badges={badges} placeholder={pronounsPlaceholder} />
      </EditableSpot>
      <UserServerTag userId={profile.id} className="mt-1" />
    </div>
  )
}
