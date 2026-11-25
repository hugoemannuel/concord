import type { WorstRow } from '../api/observability'
import { durationLabel, kindLabel, numberLabel, pctLabel, qualityLine } from '../lib/reportFormat'
import { Empty, Panel } from './Panel'

function WorstItem({ row }: { row: WorstRow }): React.JSX.Element {
  const quality = qualityLine(row)
  return (
    <li className="flex flex-col gap-2 rounded-lg bg-surface p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-ds-md font-medium text-strong">
          {row.username || '—'} · {kindLabel(row.kind)}
        </span>
        <span className="text-ds-sm text-gray-400">
          {durationLabel(row.duration_seconds)} · {row.codec || '—'} · {row.os || '—'}
        </span>
      </div>
      {row.kind !== 'call' && (
        <p className="text-ds-sm text-gray-300">
          Abaixo do alvo {pctLabel(row.below_ratio)} · {numberLabel(row.freezes_per_min)}{' '}
          congel./min · perda {numberLabel(row.loss_pct)}% · {row.gpu || 'placa desconhecida'}
        </p>
      )}
      {quality && <p className="text-ds-sm text-secondary">{quality}</p>}
      {row.reasons.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {row.reasons.map((reason) => (
            <li key={reason} className="rounded-full bg-fg/10 px-2 py-0.5 text-ds-sm text-gray-200">
              {reason}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

/** As piores sessões (de live ou de voz das calls) e o motivo provável. */
export function WorstSessions({
  title,
  empty,
  rows
}: {
  title: string
  empty: string
  rows: WorstRow[]
}): React.JSX.Element {
  return (
    <Panel title={title}>
      {rows.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {rows.map((row) => (
            <WorstItem key={row.id} row={row} />
          ))}
        </ul>
      )}
    </Panel>
  )
}
