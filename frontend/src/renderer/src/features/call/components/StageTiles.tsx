import { useAuthStore } from '../../auth/store/authStore'
import { userMenuHandler } from '../../profile/store/userMenuStore'
import Button from '../../../shared/ui/Button'
import { useCallStore } from '../store/callStore'
import type { CallUserInfo } from '../store/callStore'
import { useUserAudioStore } from '../store/userAudioStore'
import { useScreenTileProps } from '../hooks/useScreenTileProps'
import { watchedExtras } from '../lib/stagePeople'
import type { ScreenEntry } from '../lib/screenWatch'
import ParticipantTile from './ParticipantTile'
import { useGuestTagged } from '../../guests/hooks/useGuestTagged'

type TileSize = 'md' | 'lg' | 'fill'

/** Tile de outra pessoa na chamada: estado de voz, volume local e menu de contexto. */
export function PersonTile({
  user,
  speaking,
  size,
  video = null
}: {
  user: CallUserInfo
  /** ids dos usuários falando agora (useSpeaking) */
  speaking?: Set<string>
  size?: TileSize
  video?: MediaStream | null
}): React.JSX.Element {
  const meId = useAuthStore((s) => s.user?.id ?? 'me')
  const voice = useCallStore((s) => s.voiceStates[user.id])
  const locallyMuted = useUserAudioStore((s) => s.settings[user.id]?.muted ?? false)
  const shown = useGuestTagged(user)

  return (
    <ParticipantTile
      user={shown}
      selfMuted={voice?.muted}
      onContextMenu={userMenuHandler(user.id, user.display_name, meId, user.username)}
      locallyMuted={locallyMuted}
      deafened={voice?.deafened}
      serverMuted={voice?.serverMuted}
      serverDeafened={voice?.serverDeafened}
      size={size}
      speaking={speaking?.has(user.id) ?? false}
      videoStream={video}
    />
  )
}

/** O meu tile: mudo/ensurdecido vêm do estado local e a câmera sai espelhada. */
export function MeTile({
  info,
  speaking,
  size,
  video = null
}: {
  info: CallUserInfo
  speaking?: Set<string>
  size?: TileSize
  video?: MediaStream | null
}): React.JSX.Element {
  const meId = useAuthStore((s) => s.user?.id)
  const muted = useCallStore((s) => s.muted)
  const deafened = useCallStore((s) => s.deafened)

  return (
    <ParticipantTile
      user={info}
      selfMuted={muted}
      deafened={deafened}
      onContextMenu={userMenuHandler(info.id, info.display_name, meId, info.username, {
        allowSelf: true
      })}
      speaking={!muted && (speaking?.has(info.id) ?? false)}
      size={size}
      videoStream={video}
      mirror
    />
  )
}

/**
 * Tile de uma tela: a minha, uma que estou assistindo (clicável, com fechar)
 * ou o card parado "Assistir transmissão" (só baixa depois do clique).
 */
export function ScreenTile({
  entry,
  user,
  size
}: {
  entry: ScreenEntry
  user: CallUserInfo
  size: 'md' | 'fill'
}): React.JSX.Element {
  const common = useScreenTileProps(user)
  const watchScreen = useCallStore((s) => s.watchScreen)
  const stopWatchingScreen = useCallStore((s) => s.stopWatchingScreen)
  const setFocused = useCallStore((s) => s.setFocusedScreenUser)

  if (!entry.watching) {
    return (
      <ParticipantTile
        user={user}
        isScreen
        size={size}
        {...common}
        videoStream={null}
        action={
          <Button
            variant="success"
            onClick={() => watchScreen(entry.userId)}
            className={size === 'md' ? 'px-2.5 py-1 text-ds-xs' : ''}
          >
            Assistir transmissão
          </Button>
        }
      />
    )
  }
  return (
    <ParticipantTile
      user={user}
      isScreen
      size={size}
      {...common}
      videoStream={entry.stream}
      onClick={() => setFocused(entry.userId)}
      {...watchedExtras(entry, stopWatchingScreen)}
    />
  )
}
