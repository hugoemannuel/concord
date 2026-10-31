import type { CallUserInfo } from '../store/callStore'
import { useAuthStore } from '../../auth/store/authStore'
import LevelUpBurst from '../../levels/components/LevelUpBurst'
// Avatar de quem está na chamada: o GIF segue a regra da call (ver CallAvatar).
import Avatar from './CallAvatar'
import MaestroAvatar from '../../music/components/MaestroAvatar'
import { isMaestroIdentity } from '../../music/lib/music'

/** Avatar no centro do tile (sem vídeo), com o anel de quem fala e a ação abaixo. */
export default function TileAvatar({
  user,
  big,
  active,
  isScreen,
  action
}: {
  user: CallUserInfo
  /** Tile grande (96 px) ou médio (56 px). */
  big: boolean
  /** Falando ou tocando um som. */
  active: boolean
  isScreen: boolean
  /** Botão abaixo do avatar (ex.: "Assistir transmissão"). */
  action?: React.ReactNode
}): React.JSX.Element {
  // O burst no avatar é para os outros (quem subiu já tem a celebração na janela).
  const meId = useAuthStore((s) => s.user?.id)
  const size = big ? 96 : 56
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        {isMaestroIdentity(user.id) ? (
          <MaestroAvatar size={size} />
        ) : (
          <Avatar
            userId={user.id}
            name={user.display_name}
            avatarUrl={user.avatar_url}
            size={size}
            animate="always"
            className={`rounded-full transition-shadow ${active ? 'ring-4 ring-success' : ''}`}
          />
        )}
        {!isScreen && user.id !== meId && <LevelUpBurst userId={user.id} size={size} />}
      </div>
      {action}
    </div>
  )
}
