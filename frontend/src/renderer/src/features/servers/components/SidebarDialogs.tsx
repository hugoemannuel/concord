import { useState } from 'react'
import type { Channel } from '../api/channels'
import type { Server } from '../api/servers'
import { useServerStore } from '../store/serverStore'
import { useChannelSidebarStore } from '../store/channelSidebarStore'
import { useChatStore } from '../../chat/store/chatStore'
import { showToast } from '../../../shared/store/toastStore'
import Modal from '../../../shared/ui/Modal'
import Button from '../../../shared/ui/Button'
import { errorText } from '../lib/channelSidebar'
import ChannelPermissionsModal from './ChannelPermissionsModal'
import ChannelFormModal from './ChannelFormModal'
import { DeleteServerDialog, LeaveServerDialog } from './ServerConfirmDialogs'

function DeleteChannelDialog({
  server,
  channel
}: {
  server: Server
  channel: Channel
}): React.JSX.Element {
  const cancelDelete = useChannelSidebarStore((s) => s.cancelDelete)
  const [busy, setBusy] = useState(false)
  const confirm = async (): Promise<void> => {
    setBusy(true)
    try {
      await useServerStore.getState().deleteChannel(server.id, channel.id)
      void useChatStore.getState().fetchChannelsForServers([server.id])
      cancelDelete()
      showToast.success('Canal deletado!')
    } catch (err) {
      showToast.error(errorText(err, 'Falha ao deletar canal.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open title="Deletar canal" onClose={cancelDelete}>
      <p className="text-ds-md text-secondary">
        Tem certeza que deseja deletar o canal <b className="text-strong">#{channel.name}</b>? Esta
        ação não pode ser desfeita e apagará todas as mensagens do canal.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={cancelDelete}>
          Cancelar
        </Button>
        <Button variant="danger" disabled={busy} onClick={() => void confirm()}>
          {busy ? 'Deletando…' : 'Deletar canal'}
        </Button>
      </div>
    </Modal>
  )
}

/** Os diálogos da barra de canais: criar/editar, apagar canal, permissões, sair e apagar servidor. */
function SidebarDialogs({ server }: { server: Server }): React.JSX.Element {
  const deleting = useChannelSidebarStore((s) => s.deleting)
  const permissionsFor = useChannelSidebarStore((s) => s.permissionsFor)
  const deletingServer = useChannelSidebarStore((s) => s.confirm === 'delete-server')
  const leaving = useChannelSidebarStore((s) => s.confirm === 'leave')
  const closeConfirm = useChannelSidebarStore((s) => s.closeConfirm)
  const closePermissions = useChannelSidebarStore((s) => s.closePermissions)
  return (
    <>
      <ChannelFormModal server={server} />
      {deleting && <DeleteChannelDialog key={deleting.id} server={server} channel={deleting} />}
      {deletingServer && <DeleteServerDialog server={server} onClose={closeConfirm} />}
      <ChannelPermissionsModal channel={permissionsFor} onClose={closePermissions} />
      <LeaveServerDialog server={server} open={leaving} onClose={closeConfirm} />
    </>
  )
}

export default SidebarDialogs
