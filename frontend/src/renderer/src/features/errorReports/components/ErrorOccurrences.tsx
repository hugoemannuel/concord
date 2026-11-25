import { Empty, Panel, ScrollTable } from '../../observability/components/Panel'
import { timeLabel } from '../../observability/lib/timeLabel'
import type { ErrorOccurrence } from '../api/errorReports'
import { targetLabel, timesLabel, whereLabel } from '../lib/errorPanelFormat'

const HEAD = ['Quando', 'Quem', 'Versão', 'Sistema', 'Alvo', 'Tela', 'Call/live', 'Vezes']

/** As últimas ocorrências (pessoa, hora, versão), da mais nova. */
export function ErrorOccurrences({ rows }: { rows: ErrorOccurrence[] }): React.JSX.Element {
  return (
    <Panel title="Últimas ocorrências">
      {rows.length === 0 ? (
        <Empty>Nenhuma ocorrência no período.</Empty>
      ) : (
        <ScrollTable head={HEAD}>
          {rows.map((o, i) => (
            <tr key={`${o.at}-${o.username}-${o.app_version}-${i}`}>
              <td>
                <time dateTime={o.at}>{timeLabel(o.at)}</time>
              </td>
              <td className="text-strong">{o.username || '—'}</td>
              <td>{o.app_version || '—'}</td>
              <td>{o.os || '—'}</td>
              <td>{targetLabel(o.target)}</td>
              <td>{o.screen || '—'}</td>
              <td>{whereLabel(o)}</td>
              <td>{timesLabel(o.count)}</td>
            </tr>
          ))}
        </ScrollTable>
      )}
    </Panel>
  )
}
