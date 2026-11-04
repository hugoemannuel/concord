import { useDroppable } from '@dnd-kit/core'
import type { ProposalStatus } from '../api/proposals'
import { columnDrop } from '../lib/columnDrop'
import ArchiveColumnAction from './ArchiveColumnAction'

/**
 * Coluna do quadro e também o alvo de soltar do card. Durante um arrasto ela
 * mostra se aceita o card (`dragFrom` é a coluna de origem; veja columnDrop).
 */
function BoardColumn({
  status,
  title,
  hint,
  count,
  dragFrom,
  children
}: {
  status: ProposalStatus
  title: string
  hint: string
  count: number
  dragFrom: ProposalStatus | null
  children: React.ReactNode
}): React.JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const drop = columnDrop(dragFrom, status, isOver, hint)

  return (
    <section
      ref={setNodeRef}
      data-column={status}
      className={`flex min-h-0 min-w-64 flex-1 basis-64 flex-col rounded-2xl border bg-surface transition-colors ${drop.state}`}
    >
      <div className="shrink-0 px-3 pb-2 pt-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-strong">{title}</h2>
          <span className="rounded-full bg-fg/10 px-2 py-0.5 text-[11px] text-gray-300">
            {count}
          </span>
        </div>
        <p className="text-[11px] text-gray-500">{drop.hint}</p>
        <ArchiveColumnAction status={status} count={count} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3">{children}</div>
    </section>
  )
}

export default BoardColumn
