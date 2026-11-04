import { useServerStore } from '../store/serverStore'
import { useServerAccess } from '../hooks/useServerAccess'
import { deleteChannelOverwrite, setChannelOverwrite, type Channel } from '../api/channels'
import { channelPermissionsCopy } from '../lib/overwriteEditor'
import OverwriteEditor from './OverwriteEditor'

interface ChannelPermissionsModalProps {
  channel: Channel | null
  onClose: () => void
}

/** As permissões de um canal: o editor, gravando nas rotas do canal. */
function ChannelPermissionsModal({
  channel,
  onClose
}: ChannelPermissionsModalProps): React.JSX.Element | null {
  const serverId = useServerStore((s) => s.currentServer?.id)
  const fetchChannels = useServerStore((s) => s.fetchChannels)
  const liveChannel = useServerStore((s) => s.channels.find((c) => c.id === channel?.id))
  const access = useServerAccess()
  if (!channel || !liveChannel || !serverId) return null
  const { kind, title, privateHint } = channelPermissionsCopy(liveChannel)
  return (
    <OverwriteEditor
      title={title}
      kind={kind}
      privateLabel="Canal privado"
      privateHint={privateHint}
      emptyHint="Adicione um cargo ou membro para dar ou negar permissões só neste canal."
      errorMessage="Não foi possível mudar as permissões do canal."
      overwrites={liveChannel.overwrites}
      myPerms={access.channelPerms(channel.id)}
      put={(o) => setChannelOverwrite(serverId, channel.id, o.target_type, o.target_id, o.allow, o.deny)}
      remove={(type, targetId) => deleteChannelOverwrite(serverId, channel.id, type, targetId)}
      refresh={() => fetchChannels(serverId)}
      onClose={onClose}
    />
  )
}

export default ChannelPermissionsModal
