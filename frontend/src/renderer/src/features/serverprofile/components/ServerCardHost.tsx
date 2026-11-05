import Modal from '../../../shared/ui/Modal'
import Spinner from '../../../shared/ui/Spinner'
import { useServerCard } from '../hooks/useServerCard'
import { useServerCardStore } from '../store/serverCardStore'
import ServerCardView, { LockedServerCard } from './ServerCardView'

function CardContent({ serverId }: { serverId: string }): React.JSX.Element {
  const state = useServerCard(serverId)
  if (state.status === 'loading') {
    return (
      <div className="flex h-48 items-center justify-center" role="status" aria-label="Carregando o cartão do servidor">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }
  // Erro de rede também não revela nada.
  return state.status === 'ready' ? <ServerCardView card={state.card} /> : <LockedServerCard />
}

/** O cartão do servidor aberto pela tag ou pelo menu do servidor. Montado uma vez, no App. */
export default function ServerCardHost(): React.JSX.Element | null {
  const serverId = useServerCardStore((s) => s.serverId)
  const close = useServerCardStore((s) => s.close)
  if (!serverId) return null
  return (
    <Modal open title="Perfil do servidor" onClose={close}>
      <CardContent key={serverId} serverId={serverId} />
    </Modal>
  )
}
