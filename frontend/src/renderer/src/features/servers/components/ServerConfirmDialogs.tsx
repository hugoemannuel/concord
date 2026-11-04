import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Server } from '../api/servers'
import { useServerStore } from '../store/serverStore'
import { useChatStore } from '../../chat/store/chatStore'
import ConfirmModal from '../../friends/components/ConfirmModal'
import { showToast } from '../../../shared/store/toastStore'
import Modal from '../../../shared/ui/Modal'
import Button from '../../../shared/ui/Button'
import { actionErrorMessage } from '../lib/permissionErrors'
import { errorText } from '../lib/channelSidebar'

/** Depois de sair ou apagar: só sai da tela se era a deste servidor. */
function useLeaveScreen(server: Server): () => void {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  return () => {
    if (pathname.startsWith(`/servers/${server.id}`)) navigate('/friends')
  }
}

/** Confirma apagar o servidor (só o dono). Serve para o servidor aberto e para o do menu do ícone. */
export function DeleteServerDialog({
  server,
  onClose
}: {
  server: Server
  onClose: () => void
}): React.JSX.Element {
  const leaveScreen = useLeaveScreen(server)
  const [busy, setBusy] = useState(false)
  const confirm = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await useServerStore.getState().deleteServer(server.id)
      useChatStore.getState().handleServerDeleted(server.id)
      onClose()
      leaveScreen()
      showToast.success('Servidor deletado!')
    } catch (err) {
      showToast.error(errorText(err, 'Falha ao deletar servidor.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open title="Deletar servidor" onClose={onClose}>
      <p className="text-ds-md text-secondary">
        Tem certeza que deseja deletar o servidor <b className="text-strong">{server.name}</b>?
        Todos os canais e mensagens serão apagados e todos os membros serão removidos. Esta ação não
        pode ser desfeita.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="danger" disabled={busy} onClick={() => void confirm()}>
          {busy ? 'Deletando…' : 'Deletar servidor'}
        </Button>
      </div>
    </Modal>
  )
}

/** Confirma sair do servidor. Serve para o servidor aberto e para o do menu do ícone. */
export function LeaveServerDialog({
  server,
  open,
  onClose
}: {
  server: Server
  open: boolean
  onClose: () => void
}): React.JSX.Element {
  const leaveScreen = useLeaveScreen(server)
  const leave = async (): Promise<void> => {
    try {
      await useServerStore.getState().leaveServer(server.id)
      useChatStore.getState().handleServerDeleted(server.id)
      leaveScreen()
    } catch (err) {
      showToast.error(actionErrorMessage(err, 'Não foi possível sair do servidor.'))
    }
  }
  return (
    <ConfirmModal
      open={open}
      title={`Sair de ${server.name}`}
      confirmLabel="Sair do servidor"
      onClose={onClose}
      onConfirm={leave}
    >
      <p>
        Você sai de <b className="text-strong">{server.name}</b> e só volta com um novo convite.
      </p>
    </ConfirmModal>
  )
}
