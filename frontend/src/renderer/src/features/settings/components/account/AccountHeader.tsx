import type { User } from '../../../auth/store/authStore'
import { API_BASE_URL } from '../../../../shared/lib/config'
import { profileMediaSrc } from '../../../profile/lib/profileMedia'
import Avatar from '../../../../shared/ui/Avatar'
import StyledName from '../../../profile/components/StyledName'
import Button from '../../../../shared/ui/Button'

export const ACCOUNT_CARD_BG = 'var(--bg-floating)'

/** Topo de Minha conta: banner, avatar, nome e o atalho para o editor de perfil. */
export default function AccountHeader({
  user,
  onEditProfile
}: {
  user: User
  onEditProfile: () => void
}): React.JSX.Element {
  const name = user.display_name || user.username
  const bannerSrc = profileMediaSrc(user.banner_url, API_BASE_URL)
  return (
    <>
      <div
        className={`h-[100px] ${bannerSrc || user.banner_color ? '' : 'bg-gradient-brand'}`}
        style={bannerSrc || !user.banner_color ? undefined : { background: user.banner_color }}
      >
        {bannerSrc && <img src={bannerSrc} alt="" className="h-full w-full object-cover" />}
      </div>
      <div className="-mt-10 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 px-4">
        <div className="flex min-w-0 items-end gap-3">
          <div className="rounded-full p-1.5" style={{ background: ACCOUNT_CARD_BG }}>
            <Avatar
              userId={user.id}
              name={name}
              avatarUrl={user.avatar_url}
              decorationUrl={user.avatar_decoration_url}
              size={80}
              animate="always"
              status={user.status ?? 'online'}
              cutoutColor={ACCOUNT_CARD_BG}
            />
          </div>
          <p className="mb-2 truncate text-ds-lg font-bold text-strong">
            <StyledName name={name} userId={user.id} style={user.name_style} />
          </p>
        </div>
        <Button type="button" onClick={onEditProfile} className="mb-2 shrink-0">
          Editar perfil de usuário
        </Button>
      </div>
    </>
  )
}
