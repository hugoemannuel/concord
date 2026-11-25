import type { CollectionGap, LiveKitRestart } from '../api/observability'
import { gapLine } from '../lib/collectionGaps'
import { timeLabel } from '../lib/timeLabel'
import { Empty, Panel } from './Panel'

const ROW = 'border-t border-subtle px-3 py-2 tabular-nums first:border-t-0'

/**
 * Minutos sem nenhuma linha do coletor (o backend ou a VPS fora: o coletor roda
 * dentro do backend, então queda não vira "LiveKit fora") e reinícios do LiveKit.
 * Nada num backend de antes (sem os campos).
 */
export function CollectionGaps({
  gaps,
  restarts
}: {
  gaps?: CollectionGap[]
  restarts?: LiveKitRestart[]
}): React.JSX.Element | null {
  if (!gaps && !restarts) return null
  const items = [
    ...(gaps ?? []).map((g) => ({ key: `g${g.from}`, text: `Sem coleta: ${gapLine(g)}` })),
    ...(restarts ?? []).map((r) => ({
      key: `r${r.at}`,
      text: `LiveKit reiniciou: ${timeLabel(r.at)}`
    }))
  ]
  return (
    <Panel title="Sem coleta e reinícios do LiveKit">
      {items.length === 0 ? (
        <Empty>Nenhum buraco na coleta e nenhum reinício do LiveKit no período.</Empty>
      ) : (
        <ul className="flex flex-col rounded-lg bg-surface text-ds-sm text-gray-200">
          {items.map((item) => (
            <li key={item.key} className={ROW}>
              {item.text}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
