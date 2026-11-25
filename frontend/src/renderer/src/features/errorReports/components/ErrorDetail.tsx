import { Panel } from '../../observability/components/Panel'
import { timeLabel } from '../../observability/lib/timeLabel'
import type { ErrorGroup, ErrorGroupDetail } from '../api/errorReports'
import {
  agoLabel,
  errorTitle,
  peopleLabel,
  sourceLabel,
  targetLabel,
  timesLabel
} from '../lib/errorPanelFormat'
import { ErrorOccurrences } from './ErrorOccurrences'
import { ErrorStack } from './ErrorStack'
import { NewInVersionBadge } from './NewInVersionBadge'

const list = (items: string[]): string => (items.length === 0 ? '—' : items.join(', '))
const when = (iso: string, now: number): string => `${agoLabel(iso, now)} (${timeLabel(iso)})`

function summary(g: ErrorGroup, now: number): [string, string][] {
  return [
    ['Origem', sourceLabel(g.source)],
    ['Vezes', timesLabel(g.count)],
    ['Pessoas', peopleLabel(g.users)],
    ['Alvos', list(g.targets.map(targetLabel))],
    ['Primeira vez', when(g.first_seen, now)],
    ['Última vez', when(g.last_seen, now)],
    ['Versões', list(g.versions)],
    ['Sistemas', list(g.systems)]
  ]
}

function Screens({ screens }: { screens: ErrorGroupDetail['screens'] }): React.JSX.Element {
  return (
    <Panel title="Telas">
      {screens.length === 0 ? (
        <p className="text-ds-sm text-muted">Nenhuma tela registrada.</p>
      ) : (
        <ul className="flex flex-col rounded-lg bg-surface">
          {screens.map((s) => (
            <li
              key={s.screen}
              className="flex min-w-0 items-baseline justify-between gap-3 border-t border-subtle px-3 py-2 text-ds-sm first:border-t-0"
            >
              <span translate="no" className="min-w-0 break-all text-normal">
                {s.screen || '—'}
              </span>
              <span className="shrink-0 tabular-nums text-muted">{timesLabel(s.count)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/** O grupo aberto: resumo, pilha, telas e últimas ocorrências. */
export function ErrorDetail({
  detail,
  now
}: {
  detail: ErrorGroupDetail
  now: number
}): React.JSX.Element {
  const g = detail.group
  return (
    <>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2
            translate="no"
            className="min-w-0 text-pretty break-words text-ds-lg font-semibold text-strong"
          >
            {errorTitle(g.kind, g.message)}
          </h2>
          {g.new_in_version && <NewInVersionBadge />}
        </div>
        <dl className="grid grid-cols-1 gap-3 rounded-lg bg-surface p-3 sm:grid-cols-2 lg:grid-cols-4">
          {summary(g, now).map(([term, value]) => (
            <div key={term} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-ds-xs text-muted">{term}</dt>
              <dd className="break-words text-ds-sm text-normal tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <ErrorStack stack={detail.stack} translated={detail.translated} />
      <Screens screens={detail.screens} />
      <ErrorOccurrences rows={detail.recent} />
    </>
  )
}
