import { ClockIcon } from '../../../../shared/ui/icons'
import { expiresInText } from '../lib/disappearing'

/** Relógio pequeno ao lado do horário da mensagem que some sozinha; a dica diz quando. */
function ExpiryMark({
  expiresAt
}: {
  expiresAt: string | null | undefined
}): React.JSX.Element | null {
  if (!expiresAt) return null
  return (
    <span
      className="flex shrink-0 items-center text-faint"
      title={expiresInText(expiresAt, Date.now())}
    >
      <ClockIcon className="h-3 w-3" aria-hidden />
    </span>
  )
}

export default ExpiryMark
