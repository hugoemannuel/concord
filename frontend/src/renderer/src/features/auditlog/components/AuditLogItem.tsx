import { useId, useState } from 'react'
import type { AuditEntry } from '../api/auditLog'
import { describeEntry, sentenceText } from '../lib/auditActions'
import { describeChanges, isPermissionRow, type DetailRow } from '../lib/auditDetails'
import { ChevronDownIcon, ChevronRightIcon } from '../../../shared/ui/icons'
import AuditActionIcon from './AuditActionIcon'

const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

function Sentence({ entry }: { entry: AuditEntry }): React.JSX.Element {
  return (
    <p className="break-words text-ds-sm text-normal">
      {describeEntry(entry).map((part, i) =>
        part.strong ? (
          <b key={i} className="font-semibold text-strong">
            {part.text}
          </b>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </p>
  )
}

function PermissionList({ prefix, labels, tone }: { prefix: string; labels: string[]; tone: string }): React.JSX.Element | null {
  if (!labels.length) return null
  return (
    <span className={`break-words ${tone}`}>
      {prefix}: {labels.join(', ')}
    </span>
  )
}

function DetailValue({ row }: { row: DetailRow }): React.JSX.Element {
  if (isPermissionRow(row)) {
    return (
      <span className="flex flex-col gap-0.5">
        <PermissionList prefix="Liberou" labels={row.added} tone="text-success" />
        <PermissionList prefix="Tirou" labels={row.removed} tone="text-danger" />
      </span>
    )
  }
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      {row.before !== undefined && (
        <>
          <span className="break-words text-muted line-through">{row.before}</span>
          <ChevronRightIcon size={12} aria-hidden="true" className="shrink-0 text-faint" />
        </>
      )}
      <span className="break-words text-normal">{row.after}</span>
    </span>
  )
}

/** Os detalhes abertos: cada campo com o antes e o depois. */
export function AuditEntryDetails({ id, rows }: { id: string; rows: DetailRow[] }): React.JSX.Element {
  return (
    <dl id={id} className="grid gap-x-4 gap-y-2 px-3 pb-3 pl-15 text-ds-xs sm:grid-cols-[minmax(0,10rem)_1fr]">
      {rows.map((row, i) => (
        <div key={i} className="contents">
          <dt className="font-semibold uppercase tracking-wide text-muted">{row.label}</dt>
          <dd className="min-w-0">
            <DetailValue row={row} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** Uma linha do registro; com mudanças, abre os detalhes (antes e depois). */
export default function AuditLogItem({ entry }: { entry: AuditEntry }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const detailsId = useId()
  const rows = describeChanges(entry)
  const when = dateFormat.format(new Date(entry.created_at))
  const body = (
    <>
      <AuditActionIcon action={entry.action} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Sentence entry={entry} />
        <time dateTime={entry.created_at} className="text-ds-xs text-muted">
          {when}
        </time>
      </span>
    </>
  )

  if (!rows.length) {
    return <li className="flex items-start gap-3 px-3 py-3">{body}</li>
  }
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailsId}
        aria-label={`${sentenceText(describeEntry(entry))}, ${when}. ${open ? 'Esconder' : 'Ver'} detalhes`}
        onClick={() => setOpen((v) => !v)}
        className="focus-ring-inset flex min-h-11 w-full cursor-pointer items-start gap-3 px-3 py-3 text-left hover:bg-fg/5"
      >
        {body}
        <ChevronDownIcon
          size={20}
          aria-hidden="true"
          className={`mt-2 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <AuditEntryDetails id={detailsId} rows={rows} />}
    </li>
  )
}
