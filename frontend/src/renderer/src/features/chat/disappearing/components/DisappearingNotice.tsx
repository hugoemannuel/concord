import type { Message } from '../../api/messages'
import { ClockIcon } from '../../../../shared/ui/icons'

/** Aviso do modo temporário na DM: linha centralizada, no estilo do separador de dia. */
function DisappearingNotice({ message }: { message: Message }): React.JSX.Element {
  return (
    <div
      role="note"
      title={new Date(message.created_at).toLocaleString('pt-BR')}
      className="mx-4 my-2 flex items-center gap-2 max-md:mx-2"
    >
      <span aria-hidden="true" className="h-px min-w-0 flex-1 bg-fg/10" />
      <span className="flex min-w-0 shrink items-center gap-1.5 text-center text-ds-xs text-muted">
        <ClockIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {message.content}
      </span>
      <span aria-hidden="true" className="h-px min-w-0 flex-1 bg-fg/10" />
    </div>
  )
}

export default DisappearingNotice
