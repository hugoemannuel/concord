import type { BreakdownRow, LiveReport } from '../api/observability'
import { numberLabel, pctLabel } from '../lib/reportFormat'
import { Panel, ScrollTable } from './Panel'

const GROUPS: { key: keyof LiveReport['breakdown']; title: string }[] = [
  { key: 'os', title: 'Sistema' },
  { key: 'gpu', title: 'Placa de vídeo' },
  { key: 'codec', title: 'Codec' },
  { key: 'transport', title: 'Conexão (com as calls)' },
  { key: 'target', title: 'Plataforma (com as calls)' },
  { key: 'network', title: 'Rede (com as calls)' },
  { key: 'device', title: 'Aparelho Android (com as calls)' }
]

/** A média e, quando o backend manda, a mediana por pessoa ao lado. */
function withMedian(
  average: number | null,
  median: number | null | undefined,
  label: (v: number | null) => string
): string {
  return median == null ? label(average) : `${label(average)} · med. ${label(median)}`
}

function Group({ title, rows }: { title: string; rows: BreakdownRow[] }): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <h3 className="text-ds-sm font-medium text-gray-300">{title}</h3>
      <ScrollTable
        head={['', 'Sessões', 'Pessoas', 'Abaixo do alvo', 'Congel./min', 'No processador']}
      >
        {rows.map((r) => (
          <tr key={r.key}>
            <td className="max-w-64 truncate text-strong" title={r.key}>
              {r.key}
            </td>
            <td>{r.sessions}</td>
            <td>{r.people ?? '—'}</td>
            <td>{withMedian(r.below_ratio, r.below_ratio_median, pctLabel)}</td>
            <td>
              {withMedian(r.freezes_per_min, r.freezes_per_min_median, (v) => numberLabel(v))}
            </td>
            <td>{withMedian(r.software_ratio, r.software_ratio_median, pctLabel)}</td>
          </tr>
        ))}
      </ScrollTable>
    </div>
  )
}

/** Distribuição das sessões por sistema, placa, codec, conexão, plataforma, rede e aparelho. */
export function BreakdownTables({
  breakdown
}: {
  breakdown: LiveReport['breakdown']
}): React.JSX.Element {
  return (
    <Panel title="Distribuição">
      <p className="text-ds-sm text-gray-400">
        Ao lado da média, a mediana por pessoa (cada pessoa pesa igual: quem assiste muito não puxa
        o número).
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        {GROUPS.map((g) => (
          <Group key={g.key} title={g.title} rows={breakdown[g.key] ?? []} />
        ))}
      </div>
    </Panel>
  )
}
