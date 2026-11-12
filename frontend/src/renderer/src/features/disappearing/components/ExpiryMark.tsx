import { ClockIcon } from '../../../shared/ui/icons'
import { useNow } from '../hooks/useNow'
import { expiresInText } from '../lib/disappearing'

const REFRESH_MS = 30_000

function ExpiryClock({ expiresAt }: { expiresAt: string }): React.JSX.Element {
  const text = expiresInText(expiresAt, useNow(REFRESH_MS))
  return (
    <span
      role="img"
      aria-label={text}
      className="flex shrink-0 items-center text-muted"
      title={text}
    >
      <ClockIcon size={12} />
    </span>
  )
}

/** Relógio pequeno ao lado do horário da mensagem que some sozinha; a dica diz quando (e se atualiza). */
function ExpiryMark({
  expiresAt
}: {
  expiresAt: string | null | undefined
}): React.JSX.Element | null {
  if (!expiresAt) return null
  return <ExpiryClock expiresAt={expiresAt} />
}

export default ExpiryMark
