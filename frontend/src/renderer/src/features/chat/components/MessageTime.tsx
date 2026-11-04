import { useDayClock } from '../hooks/useDayClock'
import { clockTime, messageDateTitle, messageTimeLabel } from '../lib/messageDates'

/**
 * Horário da mensagem: hoje "19:54", ontem "Ontem às 19:54", antes "02/11/2026
 * 19:54". Passar o mouse mostra a data completa. Reage à virada do dia.
 */
export function MessageTime({
  iso,
  className
}: {
  iso: string
  className?: string
}): React.JSX.Element {
  const now = useDayClock()
  return (
    <time dateTime={iso} title={messageDateTitle(iso)} className={className}>
      {messageTimeLabel(iso, now)}
    </time>
  )
}

/** Só a hora ("19:54"), para a linha agrupada: ela é sempre do mesmo dia do cabeçalho. */
export function MessageClock({
  iso,
  className
}: {
  iso: string
  className?: string
}): React.JSX.Element {
  return (
    <time dateTime={iso} title={messageDateTitle(iso)} className={className}>
      {clockTime(iso)}
    </time>
  )
}
