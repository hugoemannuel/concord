import ConfirmModal from './ConfirmModal'
import { useFriendStore } from '../store/friendStore'
import { useFriendActions } from '../store/friendActionsStore'
import { showToast } from '../../../shared/store/toastStore'
import { runFriendAction } from '../lib/friendAction'

/** Montado uma vez no App. */
function FriendActionsHost(): React.JSX.Element {
  const pending = useFriendActions((s) => s.pending)
  const close = useFriendActions((s) => s.close)

  const run = async (): Promise<void> => {
    if (!pending) return
    const friends = useFriendStore.getState()
    await runFriendAction(pending, {
      remove: friends.remove,
      block: friends.block,
      error: showToast.error
    })
  }

  const isBlock = pending?.kind === 'block'
  return (
    <ConfirmModal
      open={pending !== null}
      title={isBlock ? `Bloquear ${pending?.name}?` : `Remover '${pending?.name}'`}
      confirmLabel={isBlock ? 'Bloquear' : 'Remover amigo'}
      onConfirm={() => run().catch(() => undefined)}
      onClose={close}
    >
      {isBlock ? (
        <>
          Tem certeza que quer bloquear <strong className="text-strong">{pending?.name}</strong>?
          Bloquear também remove a amizade, e essa pessoa não vai conseguir te mandar mensagens
          diretas nem pedidos de amizade.
        </>
      ) : (
        <>
          Tem certeza que quer remover <strong className="text-strong">{pending?.name}</strong> da
          sua lista de amigos? A conversa de vocês continua nas mensagens diretas.
        </>
      )}
    </ConfirmModal>
  )
}

export default FriendActionsHost
