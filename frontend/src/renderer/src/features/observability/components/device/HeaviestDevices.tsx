import type { DeviceWorstRow } from '../../api/device/deviceReport'
import { deviceLine, gpuShortName, versionLabel } from '../../lib/device/deviceFormat'
import { Empty, Panel } from '../Panel'

function DeviceItem({ row }: { row: DeviceWorstRow }): React.JSX.Element {
  const numbers = deviceLine(row)
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-lg bg-surface p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="min-w-0 break-words text-ds-md font-medium text-strong">
          {row.username || '—'}
        </span>
        <span className="min-w-0 break-words text-ds-sm text-muted">
          {row.os || '—'} · <span title={row.gpu}>{gpuShortName(row.gpu)}</span> ·{' '}
          {versionLabel(row.app_version, row.target)}
        </span>
      </div>
      {row.reasons.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {row.reasons.map((reason) => (
            <li key={reason} className="rounded-full bg-fg/10 px-2 py-0.5 text-ds-sm text-normal">
              {reason}
            </li>
          ))}
        </ul>
      )}
      {numbers && <p className="break-words text-ds-sm text-secondary">{numbers}</p>}
    </li>
  )
}

/** As pessoas com o app mais pesado ou travado e o motivo provável. */
export function HeaviestDevices({ rows }: { rows: DeviceWorstRow[] }): React.JSX.Element {
  return (
    <Panel title="Aparelhos mais pesados ou travados">
      {rows.length === 0 ? (
        <Empty>Nenhum aparelho com problema no período.</Empty>
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {rows.map((row) => (
            <DeviceItem key={`${row.user_id}-${row.app_version}-${row.target}`} row={row} />
          ))}
        </ul>
      )}
    </Panel>
  )
}
