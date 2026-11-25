import type { EventRow } from '../api/observability'
import { eventLabel, kindLabel } from '../lib/reportFormat'
import { Empty, Panel } from './Panel'

const time = (iso: string): string =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

/** O que aconteceu nas lives (início/fim, qualidade caiu, reserva, congelamentos). */
export function RecentEvents({
  events,
  title = 'Eventos recentes',
  empty = 'Nenhum evento no período.'
}: {
  events: EventRow[]
  title?: string
  empty?: string
}): React.JSX.Element {
  return (
    <Panel title={title}>
      {events.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <ol className="flex flex-col rounded-lg bg-surface text-ds-sm">
          {events.map((e, i) => (
            <li
              key={`${e.at}-${i}`}
              className="flex flex-wrap gap-x-3 gap-y-0.5 border-t border-subtle px-3 py-2 first:border-t-0"
            >
              <span className="tabular-nums text-gray-400">{time(e.at)}</span>
              <span className="text-strong">{e.username || '—'}</span>
              <span className="text-gray-400">{kindLabel(e.kind)}</span>
              <span className="text-gray-200">{eventLabel(e.type)}</span>
              {e.detail && <span className="text-gray-400">{e.detail}</span>}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}
