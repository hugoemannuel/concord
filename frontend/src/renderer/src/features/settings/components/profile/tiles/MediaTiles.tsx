import Avatar from '../../../../../shared/ui/Avatar'
import { API_BASE_URL } from '../../../../../shared/lib/config'
import { DEFAULT_BANNER, profileMediaSrc } from '../../../../profile/lib/profileMedia'
import type { ProfileImageKind as ImageKind } from '../../../../profile/api/users'
import { Tile, TileAction, TileSection } from './Tile'

/** Os "Remover" que aparecem só quando há imagem. */
function RemoveLinks({
  avatar,
  banner,
  busy,
  onRemove
}: {
  avatar: boolean
  banner: boolean
  busy: boolean
  onRemove: (kind: ImageKind) => void
}): React.JSX.Element | null {
  if (!avatar && !banner) return null
  return (
    <div className="mt-1.5 flex flex-wrap gap-x-2">
      {avatar && (
        <TileAction label="Remover avatar" disabled={busy} onClick={() => onRemove('avatar')}>
          Remover avatar
        </TileAction>
      )}
      {banner && (
        <TileAction label="Remover banner" disabled={busy} onClick={() => onRemove('banner')}>
          Remover banner
        </TileAction>
      )}
    </div>
  )
}

/**
 * Avatar e banner lado a lado, como os blocos do Discord: tocar abre o
 * arquivo (e o recorte); a imagem nova já vai para o perfil no "Aplicar".
 */
export default function MediaTiles({
  name,
  avatarUrl,
  bannerUrl,
  bannerColor,
  busy,
  onPick,
  onRemove
}: {
  name: string
  avatarUrl: string | null
  bannerUrl: string | null
  bannerColor: string | null
  busy: boolean
  onPick: (kind: ImageKind) => void
  onRemove: (kind: ImageKind) => void
}): React.JSX.Element {
  const banner = profileMediaSrc(bannerUrl, API_BASE_URL)
  return (
    <TileSection title="Avatar e banner">
      <div className="flex gap-2">
        <Tile
          label="Alterar avatar"
          disabled={busy}
          onClick={() => onPick('avatar')}
          className="size-20 shrink-0 justify-center"
        >
          <Avatar name={name} avatarUrl={avatarUrl} size={60} animate="always" />
        </Tile>
        <Tile
          label="Alterar banner"
          disabled={busy}
          onClick={() => onPick('banner')}
          className="h-20 flex-1"
        >
          <span
            aria-hidden="true"
            className="absolute inset-0"
            style={banner ? undefined : { background: bannerColor ?? DEFAULT_BANNER }}
          >
            {banner && <img src={banner} alt="" className="size-full object-cover" />}
          </span>
        </Tile>
      </div>
      <RemoveLinks avatar={Boolean(avatarUrl)} banner={Boolean(bannerUrl)} busy={busy} onRemove={onRemove} />
    </TileSection>
  )
}
