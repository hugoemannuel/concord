import { voiceChannelOf } from '../../call/lib/voiceMove'
import { useCallStore } from '../../call/store/callStore'
import { useServerAccess } from '../../servers/hooks/useServerAccess'
import { Perm } from '../../servers/lib/permissions'
import { useServerStore } from '../../servers/store/serverStore'
import { useStandardUserMenuActions } from '../hooks/useStandardUserMenuActions'
import { VoiceModerationSection } from './UserContextMenuModeration'

/**
 * Seção de voz no menu de si mesmo: permite ao próprio usuário (dono ou
 * moderador) alternar/liberar seu silenciamento ou ensurdecimento no servidor
 * quando possui a permissão no canal da chamada.
 */
export default function SelfVoiceModeration({
  target,
  itemClass,
  close
}: {
  target: { userId: string; name: string }
  itemClass: string
  close: () => void
}): React.JSX.Element | null {
  const server = useServerStore((s) => s.currentServer)
  const serverCalls = useCallStore((s) => s.serverCalls)
  const access = useServerAccess()
  const { saving, moderate } = useStandardUserMenuActions(target, server?.id, close)

  const fromChannel = server ? voiceChannelOf(serverCalls, target.userId) : null
  const voiceCall = fromChannel ? serverCalls[fromChannel] : undefined
  const voiceCallId = voiceCall?.call?.id
  if (!fromChannel || !voiceCallId) return null

  const canMute = access.canInChannel(fromChannel, Perm.MUTE_MEMBERS)
  const canDeafen = access.canInChannel(fromChannel, Perm.DEAFEN_MEMBERS)
  if (!canMute && !canDeafen) return null

  const voiceState = voiceCall?.participants.find((p) => p.user_id === target.userId)

  return (
    <VoiceModerationSection
      voiceCallId={voiceCallId}
      targetUserId={target.userId}
      serverMuted={voiceState?.server_muted}
      serverDeafened={voiceState?.server_deafened}
      canMuteInVoice={canMute}
      canDeafenInVoice={canDeafen}
      canDisconnect={false}
      itemClass={itemClass}
      saving={saving}
      onModerate={moderate}
    />
  )
}
