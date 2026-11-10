import { useCallStore } from '../../call/store/callStore'
import { PhoneIcon, PhoneOffIcon } from '../../../shared/ui/icons'
import { useInCallWith } from '../hooks/useInCallWith'
import { dmCallButton, startDmCall } from '../lib/dmCall'

/** Liga para a pessoa da DM, ou encerra a chamada que já está com ela. */
function DmCallButton({
  userId,
  conversationId,
  name,
  handle,
  online,
  blocked
}: {
  userId: string | undefined
  conversationId: string | null
  name: string
  handle: string
  online: boolean
  blocked: boolean
}): React.JSX.Element {
  const startDMCall = useCallStore((s) => s.startDMCall)
  const endCall = useCallStore((s) => s.endCall)
  const inCallWithUser = useInCallWith(userId)
  const { disabled, title } = dmCallButton({
    online,
    hasConversation: conversationId !== null,
    blocked
  })

  if (inCallWithUser) {
    return (
      <button
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-danger-strong text-white transition-colors hover:bg-danger-strong-hover"
        onClick={endCall}
        aria-label="Encerrar chamada"
        title="Encerrar chamada"
      >
        <PhoneOffIcon className="h-[18px] w-[18px]" />
      </button>
    )
  }
  return (
    <button
      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-fg/5 text-secondary transition-colors hover:bg-fg/10 hover:text-strong disabled:cursor-not-allowed disabled:opacity-40"
      onClick={() => startDmCall(startDMCall, { conversationId, userId, handle, name })}
      disabled={disabled}
      aria-label="Iniciar chamada de voz"
      title={title}
    >
      <PhoneIcon className="h-[18px] w-[18px]" />
    </button>
  )
}

export default DmCallButton
