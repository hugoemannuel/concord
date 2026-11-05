import { useState } from 'react'
import { useServerStore } from '../store/serverStore'
import { useCategories } from '../hooks/useCategories'
import { useServerAccess } from '../hooks/useServerAccess'
import { syncChannelWithCategory } from '../api/categories'
import { deleteChannelOverwrite, setChannelOverwrite, type Channel } from '../api/channels'
import { channelPermissionsCopy } from '../lib/overwriteEditor'
import { actionErrorMessage } from '../lib/permissionErrors'
import { Perm } from '../lib/permissions'
import { showToast } from '../../../shared/store/toastStore'
import Button from '../../../shared/ui/Button'
import OverwriteEditor from './OverwriteEditor'

interface ChannelPermissionsModalProps {
  channel: Channel | null
  onClose: () => void
}

/** Se o canal segue a categoria dele e, se não segue, como fazer voltar. */
export function CategorySyncNotice({ categoryName, synced, canSync, busy, onSync }: {
  categoryName: string
  synced: boolean
  canSync: boolean
  busy: boolean
  onSync: () => void
}): React.JSX.Element {
  if (synced) {
    return (
      <p className="mb-4 rounded-lg border border-subtle bg-fg/3 px-4 py-3 text-ds-sm text-muted">
        Sincronizado com a categoria <b className="text-strong">{categoryName}</b>. Mudar algo aqui faz o canal ter permissões próprias.
      </p>
    )
  }
  return (
    <div className="mb-4 flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-ds-sm text-normal">
        Este canal tem permissões próprias e não segue a categoria <b className="text-strong">{categoryName}</b>. Mesmo assim, quem não vê a categoria não vê o canal.
      </p>
      {canSync && <Button size="sm" variant="secondary" className="shrink-0" disabled={busy} onClick={onSync}>Sincronizar</Button>}
    </div>
  )
}

/** O aviso do canal que está numa categoria (o resto do editor é igual para todos). */
function useSyncNotice(serverId: string, channelId: string, refreshChannel: () => Promise<unknown>): React.ReactNode {
  const access = useServerAccess()
  const categories = useCategories(serverId, channelId)
  const [busy, setBusy] = useState(false)
  const placement = categories.layout?.channels.find((item) => item.channel_id === channelId)
  const category = categories.layout?.categories.find((item) => item.id === placement?.category_id)
  if (!placement || !category) return undefined
  const sync = async (): Promise<void> => {
    setBusy(true)
    try {
      await syncChannelWithCategory(serverId, channelId)
      await Promise.all([categories.refresh(), refreshChannel()])
      showToast.success('Canal sincronizado com a categoria.')
    } catch (err) {
      showToast.error(actionErrorMessage(err, 'Não foi possível sincronizar o canal.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <CategorySyncNotice categoryName={category.name} synced={placement.synced ?? true} busy={busy} onSync={() => void sync()}
      canSync={access.can(Perm.MANAGE_CHANNELS) && access.can(Perm.MANAGE_ROLES)} />
  )
}

function ChannelSyncNotice({ serverId, channelId, refresh }: { serverId: string; channelId: string; refresh: () => Promise<unknown> }): React.JSX.Element {
  return <>{useSyncNotice(serverId, channelId, refresh)}</>
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
      notice={<ChannelSyncNotice serverId={serverId} channelId={channel.id} refresh={() => fetchChannels(serverId)} />}
      onClose={onClose}
    />
  )
}

export default ChannelPermissionsModal
