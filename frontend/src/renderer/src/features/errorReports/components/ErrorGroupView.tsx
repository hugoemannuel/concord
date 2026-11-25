import { useEffect, useRef } from 'react'
import { useDismiss } from '../../../shared/hooks/useDismiss'
import Button from '../../../shared/ui/Button'
import { ArrowLeftIcon } from '../../../shared/ui/icons'
import { useErrorGroup } from '../hooks/useErrorGroup'
import { ErrorDetail } from './ErrorDetail'
import { LoadGate } from './LoadGate'

/** Um grupo aberto; "Voltar à lista" (ou Esc) fecha. O foco vai para o botão de voltar. */
export function ErrorGroupView({
  fingerprint,
  days,
  now,
  onClose
}: {
  fingerprint: string
  days: number
  now: number
  onClose: () => void
}): React.JSX.Element {
  const { state, reload } = useErrorGroup(fingerprint, days)
  const back = useRef<HTMLDivElement>(null)
  useEffect(() => back.current?.querySelector('button')?.focus(), [fingerprint])
  // Esc em qualquer lugar da página fecha; clique nunca é "fora".
  useDismiss(() => true, onClose)
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div ref={back}>
        <Button variant="ghost" icon={ArrowLeftIcon} aria-keyshortcuts="Escape" onClick={onClose}>
          Voltar à lista
        </Button>
      </div>
      <LoadGate state={state} reload={reload}>
        {(detail) => <ErrorDetail detail={detail} now={now} />}
      </LoadGate>
    </div>
  )
}
