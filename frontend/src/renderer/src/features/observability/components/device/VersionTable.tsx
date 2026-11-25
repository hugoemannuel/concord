import type { DeviceVersionRow } from '../../api/device/deviceReport'
import {
  cpuLabel,
  mbLabel,
  msLabel,
  perMinLabel,
  versionLabel
} from '../../lib/device/deviceFormat'
import { Empty, Panel, ScrollTable } from '../Panel'

const HEAD = [
  'Versão',
  'Pessoas',
  'CPU em call',
  'Memória',
  'Atraso p95',
  'Travadas',
  'Janela parou',
  'Sem aceleração'
]

/** Uma linha por versão do app (desktop e web separados), da mais nova para a mais velha. */
export function VersionTable({ rows }: { rows: DeviceVersionRow[] }): React.JSX.Element {
  return (
    <Panel title="Por versão do app">
      {rows.length === 0 ? (
        <Empty>Sem dados no período.</Empty>
      ) : (
        <ScrollTable head={HEAD}>
          {rows.map((r) => (
            <tr key={`${r.app_version}-${r.target}`}>
              <td className="text-strong">{versionLabel(r.app_version, r.target)}</td>
              <td>{r.people}</td>
              <td>{cpuLabel(r.cpu_app_call)}</td>
              <td>{mbLabel(r.mem_app_mb)}</td>
              <td>{msLabel(r.lag_p95_p50)}</td>
              <td>{perMinLabel(r.long_ms_per_min)}</td>
              <td>{r.hangs}</td>
              <td>{r.software_gpu_people}</td>
            </tr>
          ))}
        </ScrollTable>
      )}
    </Panel>
  )
}
