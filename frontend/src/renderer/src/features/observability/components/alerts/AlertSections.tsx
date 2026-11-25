import type { AlertReport, AlertRow, AlertSeverity } from '../../api/alerts'
import { alertDuration, recurrence, severityLabel } from '../../lib/alertFormat'
import { timeLabel } from '../../lib/timeLabel'
import { Empty, Panel, ScrollTable } from '../Panel'

function SeverityBadge({ severity }: { severity: AlertSeverity }): React.JSX.Element {
  const tone = severity === 'critico' ? 'bg-danger/20 text-danger' : 'bg-warning/20 text-warning'
  return (
    <span className={`rounded px-1.5 py-px text-ds-xxs font-bold uppercase tracking-wide ${tone}`}>
      {severityLabel(severity)}
    </span>
  )
}

/** O que está disparado agora, com o último número visto. */
function ActiveAlerts({ rows }: { rows: AlertRow[] }): React.JSX.Element {
  return (
    <Panel title="Disparados agora">
      {rows.length === 0 ? (
        <Empty>Nada disparado agora.</Empty>
      ) : (
        <ul className="flex flex-col rounded-lg bg-surface text-ds-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 border-t border-subtle px-3 py-2 first:border-t-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <SeverityBadge severity={r.severity} />
                <span className="font-medium text-strong">{r.title || r.rule_id}</span>
                <span className="text-muted">
                  desde {timeLabel(r.started_at)} ({alertDuration(r)})
                </span>
              </div>
              {r.text && <p className="break-words text-normal">{r.text}</p>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/** Quantas vezes cada regra disparou: o que se repete pede correção. */
function Recurrence({ rows }: { rows: AlertRow[] }): React.JSX.Element | null {
  const counts = recurrence(rows)
  if (counts.length === 0) return null
  return (
    <Panel title="Recorrência">
      <ul className="flex flex-wrap gap-2 text-ds-sm">
        {counts.map((c) => (
          <li key={c.title} className="rounded-lg bg-surface px-3 py-1.5 text-normal">
            {c.title}: <span className="tabular-nums text-strong">{c.count}</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function History({ rows }: { rows: AlertRow[] }): React.JSX.Element {
  return (
    <Panel title="Histórico">
      {rows.length === 0 ? (
        <Empty>Nenhum alerta no período.</Empty>
      ) : (
        <ScrollTable head={['Início', 'Regra', 'Gravidade', 'Duração', 'Detalhe']}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{timeLabel(r.started_at)}</td>
              <td>{r.title || r.rule_id}</td>
              <td>
                <SeverityBadge severity={r.severity} />
              </td>
              <td>{alertDuration(r)}</td>
              <td className="max-w-md whitespace-normal break-words">{r.text}</td>
            </tr>
          ))}
        </ScrollTable>
      )}
    </Panel>
  )
}

/** A aba Alertas pronta: o que está disparado, a recorrência e o histórico. */
export function AlertSections({ report }: { report: AlertReport }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      {!report.enabled && (
        <p className="text-ds-sm text-muted">
          Os alertas estão desligados neste servidor (ALERTS_SERVER_ID vazio). Veja docs/HOSPEDAGEM.md.
        </p>
      )}
      <ActiveAlerts rows={report.active} />
      <Recurrence rows={report.history} />
      <History rows={report.history} />
    </div>
  )
}
