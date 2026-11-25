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

function Group({ title, rows }: { title: string; rows: BreakdownRow[] }): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <h3 className="text-ds-sm font-medium text-gray-300">{title}</h3>
      <ScrollTable head={['', 'Sessões', 'Abaixo do alvo', 'Congel./min', 'No processador']}>
        {rows.map((r) => (
          <tr key={r.key}>
            <td className="max-w-64 truncate text-strong" title={r.key}>
              {r.key}
            </td>
            <td>{r.sessions}</td>
            <td>{pctLabel(r.below_ratio)}</td>
            <td>{numberLabel(r.freezes_per_min)}</td>
            <td>{pctLabel(r.software_ratio)}</td>
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
      <div className="grid gap-3 lg:grid-cols-2">
        {GROUPS.map((g) => (
          <Group key={g.key} title={g.title} rows={breakdown[g.key] ?? []} />
        ))}
      </div>
    </Panel>
  )
}
