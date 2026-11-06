import { timeLabel } from '../lib/timeLabel'
import type { LiveRow } from '../api/observability'
import { durationLabel, numberLabel, pctLabel } from '../lib/reportFormat'
import { Empty, Panel, ScrollTable } from './Panel'

const HEAD = [
  'Quem',
  'Início',
  'Duração',
  'Codec',
  'Na placa',
  'Abaixo do alvo',
  'Limitada por',
  'Espectadores',
  'Congel./min',
  'Decod. no processador',
  'Sistema'
]

function limitedBy(row: LiveRow): string {
  const parts = [
    row.cpu_ratio >= 0.1 ? `CPU ${pctLabel(row.cpu_ratio)}` : '',
    row.bandwidth_ratio >= 0.1 ? `banda ${pctLabel(row.bandwidth_ratio)}` : ''
  ].filter(Boolean)
  return parts.join(', ') || '—'
}

/** Lives recentes (quem transmitiu), com o que os espectadores viram. */
export function LivesTable({ rows }: { rows: LiveRow[] }): React.JSX.Element {
  return (
    <Panel title="Lives recentes">
      {rows.length === 0 ? (
        <Empty>Nenhuma live no período.</Empty>
      ) : (
        <ScrollTable head={HEAD}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="text-strong">{r.username || '—'}</td>
              <td>{timeLabel(r.started_at)}</td>
              <td>{durationLabel(r.duration_seconds)}</td>
              <td>{r.codec || '—'}</td>
              <td>{pctLabel(r.hardware_ratio)}</td>
              <td>{pctLabel(r.below_ratio)}</td>
              <td>{limitedBy(r)}</td>
              <td>{r.viewers}</td>
              <td>{numberLabel(r.viewer_freezes_per_min)}</td>
              <td>{pctLabel(r.viewer_software_ratio)}</td>
              <td>{r.os || '—'}</td>
            </tr>
          ))}
        </ScrollTable>
      )}
    </Panel>
  )
}
