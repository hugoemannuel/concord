import type { Message } from '../api/messages'
import { dayDividerText, startsNewDay } from '../lib/messageDates'

/** Linha com a data no meio ("3 de novembro de 2026"). */
export function DayDivider({ text }: { text: string }): React.JSX.Element {
  return (
    <div
      role="separator"
      aria-label={text}
      className="mx-4 my-2 flex items-center gap-2 max-md:mx-2"
    >
      <span aria-hidden="true" className="h-px min-w-0 flex-1 bg-fg/10" />
      <span aria-hidden="true" className="shrink-0 text-ds-xs font-semibold text-muted">
        {text}
      </span>
      <span aria-hidden="true" className="h-px min-w-0 flex-1 bg-fg/10" />
    </div>
  )
}

/**
 * O separador de dia antes de `message`: aparece na primeira mensagem da
 * lista e a cada virada de dia em relação à anterior. A decisão é na
 * renderização, como a do agrupamento, então vale para páginas antigas que
 * chegam e para mensagens ao vivo.
 */
function MessageDayDivider({
  message,
  previous
}: {
  message: Pick<Message, 'created_at'>
  previous: Pick<Message, 'created_at'> | undefined
}): React.JSX.Element | null {
  if (!startsNewDay(message.created_at, previous?.created_at)) return null
  return <DayDivider text={dayDividerText(message.created_at)} />
}

export default MessageDayDivider
