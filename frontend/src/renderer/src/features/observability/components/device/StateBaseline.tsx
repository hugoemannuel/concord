import type { DeviceBaselineRow } from '../../api/device/deviceReport'
import { cpuLabel, mbLabel, msLabel, stateLabel } from '../../lib/device/deviceFormat'
import { Empty, Panel, ScrollTable } from '../Panel'

const HEAD = [
  'Estado',
  'Linhas',
  'Pessoas',
  'CPU p50',
  'CPU p90',
  'Renderer p50',
  'Memória p50',
  'Memória p90',
  'Atraso p95'
]

/** Linha de base: quanto o app consome, tipicamente, parado, em call e transmitindo. */
export function StateBaseline({ rows }: { rows: DeviceBaselineRow[] }): React.JSX.Element {
  return (
    <Panel title="Consumo típico por estado">
      {rows.length === 0 ? (
        <Empty>Sem dados no período.</Empty>
      ) : (
        <ScrollTable head={HEAD}>
          {rows.map((r) => (
            <tr key={r.state}>
              <td className="text-strong">{stateLabel(r.state)}</td>
              <td>{r.samples.toLocaleString('pt-BR')}</td>
              <td>{r.people}</td>
              <td>{cpuLabel(r.cpu_app_p50)}</td>
              <td>{cpuLabel(r.cpu_app_p90)}</td>
              <td>{cpuLabel(r.cpu_renderer_p50)}</td>
              <td>{mbLabel(r.mem_app_p50)}</td>
              <td>{mbLabel(r.mem_app_p90)}</td>
              <td>{msLabel(r.lag_p95_p50)}</td>
            </tr>
          ))}
        </ScrollTable>
      )}
    </Panel>
  )
}
