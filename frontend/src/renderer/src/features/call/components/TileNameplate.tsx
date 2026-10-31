import type { CallUserInfo } from '../store/callStore'
import VoiceStateIcons from './VoiceStateIcons'
import StyledName from '../../profile/components/StyledName'
import ConnectionQualityBars from './ConnectionQualityBars'
import CallActivityBadge from './CallActivityBadge'
import { VolumeOffIcon } from '../../../shared/ui/icons'
import { isMaestroIdentity, T18 } from '../../music/lib/music'

/** Etiqueta com o nome e o estado de voz no canto inferior esquerdo do tile. */
export default function TileNameplate({
  user,
  isScreen,
  locallyMuted,
  voice
}: {
  user: CallUserInfo
  isScreen: boolean
  /** Silenciado por você (só você não ouve). */
  locallyMuted: boolean
  voice: {
    muted: boolean
    deafened: boolean
    serverMuted: boolean
    serverDeafened: boolean
  }
}): React.JSX.Element {
  const maestro = isMaestroIdentity(user.id)
  return (
    <div className="on-media absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 backdrop-blur-sm">
      {locallyMuted && (
        <span title="Silenciado por você" className="text-gray-300">
          <VolumeOffIcon className="h-3 w-3" />
        </span>
      )}
      <VoiceStateIcons {...voice} className="h-3 w-3" />
      <span className="truncate text-xs font-semibold text-strong">
        <StyledName name={user.display_name} userId={user.id} style={user.name_style} />
      </span>
      {!isScreen && <CallActivityBadge userId={user.id} className="h-3.5 w-3.5" />}
      {maestro && (
        <span className="rounded bg-violet-400/30 px-1 text-[9px] font-bold uppercase text-violet-100">
          {T18.tag}
        </span>
      )}
      {!isScreen && !maestro && (
        <ConnectionQualityBars userId={user.id} name={user.display_name} className="h-3 w-3" />
      )}
    </div>
  )
}
