import type { ErrorGroup } from '../api/errorReports'
import { timeLabel } from '../../observability/lib/timeLabel'
import {
  agoLabel,
  groupElementId,
  errorTitle,
  shortList,
  sourceLabel,
  timesLabel,
  peopleLabel
} from '../lib/errorPanelFormat'
import { NewInVersionBadge } from './NewInVersionBadge'

// Colunas no largo (lg+); no estreito cada grupo é um cartão.
const COLS = 'lg:grid-cols-[minmax(0,1fr)_7rem_6rem_6rem_6rem_6rem]'
const HEAD = ['Erro', 'Origem', 'Vezes', 'Pessoas', 'Primeira vez', 'Última vez']

/** Um dado do cartão: com rótulo no estreito, só o valor na coluna do largo. */
function Cell({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <span className="flex min-w-0 gap-1 text-ds-sm text-normal tabular-nums">
      <span className="text-muted lg:sr-only">{label}</span>
      {children}
    </span>
  )
}

function When({ iso, now }: { iso: string; now: number }): React.JSX.Element {
  return (
    <time dateTime={iso} title={timeLabel(iso)}>
      {agoLabel(iso, now)}
    </time>
  )
}

function GroupRow({
  group: g,
  now,
  onOpen
}: {
  group: ErrorGroup
  now: number
  onOpen: (fingerprint: string) => void
}): React.JSX.Element {
  return (
    <li className="lg:border-t lg:border-subtle">
      <button
        id={groupElementId(g.fingerprint)}
        type="button"
        onClick={() => onOpen(g.fingerprint)}
        className={`focus-ring-inset grid w-full cursor-pointer gap-2 rounded-lg bg-surface p-3 text-left transition-colors hover:bg-hover lg:items-center lg:rounded-none lg:bg-transparent lg:px-3 lg:py-2 ${COLS}`}
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              translate="no"
              className="line-clamp-2 min-w-0 break-words text-ds-sm font-medium text-strong"
            >
              {errorTitle(g.kind, g.message)}
            </span>
            {g.new_in_version && <NewInVersionBadge />}
          </span>
          <span translate="no" className="truncate text-ds-xs text-muted">
            {shortList(g.versions)} · {shortList(g.systems)}
          </span>
        </span>
        <span className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3 lg:contents">
          <Cell label="Origem">{sourceLabel(g.source)}</Cell>
          <Cell label="Vezes">{timesLabel(g.count)}</Cell>
          <Cell label="Pessoas">{peopleLabel(g.users)}</Cell>
          <Cell label="Primeira vez">
            <When iso={g.first_seen} now={now} />
          </Cell>
          <Cell label="Última vez">
            <When iso={g.last_seen} now={now} />
          </Cell>
        </span>
      </button>
    </li>
  )
}

/** Os grupos na ordem do servidor (mais pessoas afetadas, depois os mais recentes). */
export function ErrorGroupList({
  groups,
  filtered,
  now,
  onOpen
}: {
  groups: ErrorGroup[]
  filtered: boolean
  now: number
  onOpen: (fingerprint: string) => void
}): React.JSX.Element {
  if (groups.length === 0) {
    return (
      <p className="text-ds-sm text-muted">
        {filtered ? 'Nenhum erro com esses filtros no período.' : 'Nenhum erro no período.'}
      </p>
    )
  }
  return (
    <div className="lg:overflow-hidden lg:rounded-lg lg:bg-surface">
      <div
        aria-hidden="true"
        className={`hidden px-3 py-2 text-ds-sm font-medium text-muted lg:grid lg:gap-2 ${COLS}`}
      >
        {HEAD.map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      <ul aria-label="Erros" className="flex flex-col gap-2 lg:gap-0">
        {groups.map((g) => (
          <GroupRow key={g.fingerprint} group={g} now={now} onOpen={onOpen} />
        ))}
      </ul>
    </div>
  )
}
