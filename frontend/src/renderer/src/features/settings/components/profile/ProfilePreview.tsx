import type { User } from '../../../auth/store/authStore'
import BadgeRow from '../../../levels/components/BadgeRow'
import LevelBadge from '../../../levels/components/LevelBadge'
import ProfileCardBody from '../../../profile/components/ProfileCardBody'
import ProfileCardFrame from '../../../profile/components/ProfileCardFrame'
import { CardMemberSince, CardVisitorButtons } from '../../../profile/components/card/CardSampleExtras'
import { linkError, normalizeLink } from '../../../profile/lib/profileLinks'
import { DEFAULT_BANNER } from '../../../profile/lib/profileMedia'
import { profileThemeLook, resolveProfileTheme } from '../../../profile/lib/profileTheme'
import type { ProfileDraft } from '../../../profile/lib/profileValidation'
import type { CardSpot } from '../../../profile/lib/cardSpots'


/** O que a prévia precisa além do rascunho: a conta e as imagens já resolvidas. */
export interface PreviewBase {
  user: User
  avatarUrl: string | null
  bannerUrl: string | null
  /** Perfil de servidor sem CHANGE_NICKNAME: o nome não muda aqui. */
  nameLocked?: boolean
}

/**
 * O cartão de perfil como os outros vão ver (o mesmo ProfileCardBody e a
 * mesma moldura do cartão que abre ao clicar), com o rascunho por cima do
 * salvo: badges, nível, "Membro desde" e os botões de quem visita. Com
 * `onEdit`, cada parte abre o editor dela.
 */
export default function ProfilePreview({
  user,
  draft,
  avatarUrl,
  bannerUrl,
  onEdit
}: {
  user: User
  draft: ProfileDraft
  avatarUrl: string | null
  bannerUrl: string | null
  onEdit?: (spot: CardSpot) => void
}): React.JSX.Element {
  const theme = resolveProfileTheme(draft.profile_theme)
  const look = profileThemeLook(theme)
  const name = draft.display_name.trim() || user.username
  return (
    <ProfileCardFrame
      look={look}
      effect={theme.effect}
      className="text-ds-sm text-normal shadow-2xl"
    >
      <ProfileCardBody
        preview
        isMe
        surface={look.surface}
        onEdit={onEdit}
        // Sem id: o nome usa o estilo do rascunho, não o salvo (profileStore).
        profile={{
          display_name: name,
          name_style: draft.name_style,
          username: user.username,
          avatar_url: avatarUrl,
          avatar_decoration_url: user.avatar_decoration_url,
          banner_url: bannerUrl,
          banner_color: draft.banner_color,
          pronouns: draft.pronouns.trim(),
          bio: draft.bio,
          status_text: draft.status_text,
          // Na prévia só entram os links válidos.
          links: draft.links.map(normalizeLink).filter((l) => !linkError(l))
        }}
        status={user.status ?? 'online'}
        fallbackBanner={DEFAULT_BANNER}
        badge={<LevelBadge userId={user.id} size="md" />}
        badges={<BadgeRow userId={user.id} name={name} avatarUrl={avatarUrl} />}
      >
        <CardMemberSince createdAt={user.created_at} />
        <CardVisitorButtons />
      </ProfileCardBody>
    </ProfileCardFrame>
  )
}
