import type { User } from '../../../../auth/store/authStore'
import Avatar from '../../../../../shared/ui/Avatar'
import Nameplate from '../../../../profile/components/Nameplate'
import { Tile, TileSection } from '../tiles/Tile'

/** O bloco "Faixa e moldura": a linha em miniatura, parada, como na lista. */
export default function CosmeticsTile({
  user,
  onOpen
}: {
  user: User
  onOpen: () => void
}): React.JSX.Element {
  const name = user.display_name || user.username
  return (
    <TileSection title="Faixa e moldura">
      <Tile label="Faixa e moldura" onClick={onOpen} className="h-12 w-full gap-3 px-3 pr-9">
        <Nameplate url={user.nameplate_url} active={false} fade="var(--bg-members)" />
        <Avatar
          name={name}
          avatarUrl={user.avatar_url}
          decorationUrl={user.avatar_decoration_url}
          animate="never"
          size={28}
        />
        <span className="relative min-w-0 truncate text-ds-sm font-medium text-strong">{name}</span>
      </Tile>
    </TileSection>
  )
}
