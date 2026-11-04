import type { ReactNode } from 'react'
import { API_BASE_URL } from '../../../shared/lib/config'
import { MAESTRO_USER_ID } from '../../music/lib/music'
import { profileMediaSrc } from '../lib/profileMedia'
import type { PresenceStatus } from '../../friends/lib/presenceStatus'
import maestroBanner from '../../../assets/maestro-banner.gif'
import { ProfileActivities } from '../../activity/components/ProfileActivities'
import { ProfileBioSkeleton } from '../../../shared/ui/skeleton/layouts'
import CardAvatar from './card/CardAvatar'
import CardBanner from './card/CardBanner'
import CardNames from './card/CardNames'
import CardNote from './card/CardNote'
import { CardBio, CardLinks, MaestroHowto } from './card/CardSections'
import type { NameStyle } from '../lib/nameStyle'
import { SPOT_PLACEHOLDER, type CardSpot } from '../lib/cardSpots'
import EditableSpot from './card/EditableSpot'
import { CARD_BG, type ProfileTheme } from '../lib/profileTheme'

/** Fundo do cartão sem tema: recorta o avatar e a bolinha de status. */
export { CARD_BG }

export interface CardProfile {
  id?: string
  display_name: string
  name_style?: NameStyle
  /** Apelido no servidor aberto: aparece em destaque, com o nome de verdade embaixo. */
  nickname?: string | null
  username?: string
  avatar_url?: string | null
  avatar_decoration_url?: string | null
  banner_url?: string | null
  banner_color?: string | null
  pronouns?: string
  bio?: string
  status_text?: string
  links?: string[]
  /** Bot (Maestro, Salinha Bot): selo BOT; o Maestro tem banner animado próprio. */
  is_bot?: boolean
  /** Borda, fundo e efeito do cartão (quem desenha é o ProfileCardFrame). */
  profile_theme?: ProfileTheme
}

interface ProfileCardBodyProps {
  profile: CardProfile
  status?: PresenceStatus | null
  isMe?: boolean
  /** Banner sem imagem nem cor escolhida (o gradiente de cargo/nível). */
  fallbackBanner: string
  avatarFallbackClassName?: string
  /** Canto direito, na altura do avatar (selo de nível). */
  badge?: ReactNode
  /** Fileira de badges ao lado do username. */
  badges?: ReactNode
  /** Só no próprio perfil: avatar e nota vazia levam ao editor. */
  onEditProfile?: () => void
  /** Prévia do editor: o avatar não usa o profileStore (mostra o rascunho). */
  preview?: boolean
  /**
   * O perfil completo (banner, nota, Sobre mim) ainda não chegou: o cartão já
   * mostra o que se sabe (nome, @usuário) e o resto aparece em skeleton.
   */
  loading?: boolean
  /** Cor do fundo logo abaixo do banner (tema): anel do avatar e recorte do status. */
  surface?: string
  /**
   * Prévia do editor: cada parte (avatar, banner, nome, pronomes, nota, Sobre
   * mim, links) vira um botão que abre o editor dela; as vazias mostram o
   * convite para adicionar.
   */
  onEdit?: (spot: CardSpot) => void
  children?: ReactNode
}

type EditSpot = (spot: CardSpot) => void

const spotHandler = (onEdit: EditSpot | undefined, spot: CardSpot): (() => void) | undefined =>
  onEdit && (() => onEdit(spot))

/** "Adicionar uma nota": no editor abre o modal; no próprio cartão, o editor de perfil. */
function addNote(isMe: boolean, onEditProfile?: () => void, onEdit?: EditSpot): (() => void) | undefined {
  if (onEdit) return () => onEdit('note')
  return isMe ? onEditProfile : undefined
}

/** Banner sem imagem do perfil: o do Maestro é animado; o Salinha Bot fica com o gradiente. */
function bannerFor(profile: CardProfile): string | null {
  const own = profileMediaSrc(profile.banner_url, API_BASE_URL)
  if (own) return own
  return profile.is_bot && profile.id === MAESTRO_USER_ID ? maestroBanner : null
}

/**
 * Corpo do cartão de perfil (banner, avatar, nota, nome, Sobre mim e links),
 * igual no cartão que abre ao clicar e na prévia do editor de perfil.
 */
function ProfileCardBody({
  profile,
  status,
  isMe = false,
  fallbackBanner,
  avatarFallbackClassName,
  badge,
  badges,
  onEditProfile,
  preview = false,
  loading = false,
  surface = CARD_BG,
  onEdit,
  children
}: ProfileCardBodyProps): React.JSX.Element {
  const bannerSrc = bannerFor(profile)
  const bio = profile.bio?.trim()
  const placeholders = onEdit ? SPOT_PLACEHOLDER : undefined

  return (
    <div>
      <CardBanner
        src={bannerSrc}
        color={profile.banner_color}
        fallback={fallbackBanner}
        loading={loading}
        surface={surface}
        onEdit={spotHandler(onEdit, 'banner')}
      />

      <div className="px-4 pb-4">
        {/* A faixa que sobe por cima do banner não pega o mouse (o lápis do banner
            aparece nela também); só o avatar, a nota e o selo pegam. */}
        <div className="pointer-events-none relative -mt-[46px] flex items-start justify-between">
          <div className="flex min-w-0 items-start gap-2">
            <CardAvatar
              userId={preview ? undefined : profile.id}
              name={profile.nickname || profile.display_name}
              avatarUrl={profile.avatar_url}
              decorationUrl={profile.avatar_decoration_url}
              status={status}
              surface={surface}
              fallbackClassName={avatarFallbackClassName}
              onEditProfile={onEditProfile}
              onEdit={spotHandler(onEdit, 'avatar')}
            />
            <CardNote
              note={profile.status_text?.trim()}
              onAdd={addNote(isMe, onEditProfile, onEdit)}
              onEdit={onEdit}
              placeholder={placeholders?.note}
            />
          </div>
          {badge && <div className="pointer-events-auto mt-[52px] shrink-0">{badge}</div>}
        </div>

        <CardNames
          profile={profile}
          you={isMe && !preview}
          badges={badges}
          onEdit={onEdit}
          pronounsPlaceholder={placeholders?.pronouns}
        />
        <ProfileActivities userId={preview ? undefined : profile.id} />
        {loading && !bio && <ProfileBioSkeleton />}
        <EditableSpot spot="bio" onEdit={onEdit}>
          <CardBio bio={bio} placeholder={placeholders?.bio} />
        </EditableSpot>
        {profile.is_bot && profile.id === MAESTRO_USER_ID && <MaestroHowto />}
        <EditableSpot spot="links" onEdit={onEdit}>
          <CardLinks links={profile.links ?? []} placeholder={placeholders?.links} />
        </EditableSpot>

        {children}
      </div>
    </div>
  )
}

export default ProfileCardBody
