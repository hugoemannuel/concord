import { useServerStore } from '../store/serverStore'
import { useServerMenuStore, type ServerConfirmKind } from '../store/serverMenuStore'
import type { Server } from '../api/servers'
import { usePendingServerRequest } from '../hooks/usePendingServerRequest'
import ServerLevelModal from '../../serverlevel/components/ServerLevelModal'
import { showToast } from '../../../shared/store/toastStore'
import { CategoryDialogs } from './CategoryDialogs'
import { DeleteServerDialog, LeaveServerDialog } from './ServerConfirmDialogs'

/** Roda a operação e avisa se falhar; true = deu certo. */
async function runCategoryOperation(operation: () => Promise<void>): Promise<boolean> {
  try {
    await operation()
    return true
  } catch {
    showToast.error('Não foi possível alterar as categorias.')
    return false
  }
}

/** "Criar categoria" pelo menu do ícone, no servidor clicado. */
function CategoryHost(): React.JSX.Element | null {
  const serverId = useServerMenuStore((s) => s.categoryFor)
  const close = useServerMenuStore((s) => s.closeCategory)
  if (!serverId) return null
  return (
    <CategoryDialogs
      key={serverId}
      serverId={serverId}
      dialog={{ kind: 'create' }}
      close={close}
      run={runCategoryOperation}
    />
  )
}

const CONFIRM_DIALOG: Record<
  ServerConfirmKind,
  (props: { server: Server; onClose: () => void }) => React.JSX.Element
> = {
  leave: ({ server, onClose }) => <LeaveServerDialog server={server} open onClose={onClose} />,
  'delete-server': ({ server, onClose }) => <DeleteServerDialog server={server} onClose={onClose} />
}

/** Sair ou apagar um servidor que não é o aberto (o aberto usa o SidebarDialogs). */
function ConfirmHost(): React.JSX.Element | null {
  const confirm = useServerMenuStore((s) => s.confirm)
  const close = useServerMenuStore((s) => s.closeConfirm)
  const server = useServerStore((s) => s.servers.find((srv) => srv.id === confirm?.serverId))
  if (!confirm || !server) return null
  const Dialog = CONFIRM_DIALOG[confirm.kind]
  return <Dialog server={server} onClose={close} />
}

/**
 * O que o menu do ícone do servidor (botão direito no trilho) abre e que não
 * pode depender da tela do servidor aberto: nível, categoria, sair e apagar.
 * Também roda os pedidos que esperam o servidor abrir. Fica no AppShell.
 */
function ServerMenuHosts(): React.JSX.Element {
  usePendingServerRequest()
  return (
    <>
      <ServerLevelModal />
      <CategoryHost />
      <ConfirmHost />
    </>
  )
}

export default ServerMenuHosts
