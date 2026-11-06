import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import type { Proposal, ProposalStatus } from '../api/proposals'
import type { ProposalActions } from '../hooks/useProposalBoard'
import type { useProposalDrag } from '../hooks/useProposalDrag'
import { showRejectZone } from '../lib/boardFlows'
import { sortColumn } from '../lib/proposals'
import { snapCenterToCursor } from '../../../shared/lib/dragModifiers'
import BoardColumn from './BoardColumn'
import DraggableProposalCard from './DraggableProposalCard'
import ProposalCard from './ProposalCard'
import RejectDropZone from './RejectDropZone'

// O arrasto só começa depois de alguns pixels: um clique parado abre o card e os
// botões de dentro dele continuam funcionando.
const DRAG_DISTANCE_PX = 8

interface CardContext {
  now: number
  meId: string | null
  isTech: boolean
  busyId: string | null
  actions: (id: string) => ProposalActions
  onOpen: (id: string) => void
}

interface ProposalBoardDndProps extends CardContext {
  proposals: Proposal[]
  columns: { status: ProposalStatus; title: string; hint: string }[]
  showRejected: boolean
  drag: ReturnType<typeof useProposalDrag>
}

const noop = (): void => {}

function ColumnCards({ cards, ctx }: { cards: Proposal[]; ctx: CardContext }): React.JSX.Element {
  if (cards.length === 0) {
    return <p className="py-6 text-center text-xs text-gray-500">Nada por aqui ainda.</p>
  }
  return (
    <>
      {cards.map((p) => (
        <DraggableProposalCard
          key={p.id}
          draggable={ctx.isTech && ctx.busyId !== p.id}
          proposal={p}
          now={ctx.now}
          meId={ctx.meId}
          isTech={ctx.isTech}
          busy={ctx.busyId === p.id}
          onOpen={() => ctx.onOpen(p.id)}
          {...ctx.actions(p.id)}
        />
      ))}
    </>
  )
}

/** As colunas do quadro com arrastar e soltar (o card arrastado segue o cursor). */
function ProposalBoardDnd({
  proposals,
  columns,
  showRejected,
  drag,
  ...ctx
}: ProposalBoardDndProps): React.JSX.Element {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_DISTANCE_PX } })
  )
  const dragFrom = drag.dragging?.status ?? null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={drag.onDragStart}
      onDragEnd={drag.onDragEnd}
      onDragCancel={drag.onDragCancel}
    >
      <div className="relative flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto px-6 py-4">
          {columns.map((col) => {
            const cards = sortColumn(
              proposals.filter((p) => p.status === col.status),
              col.status
            )
            return (
              <BoardColumn
                key={col.status}
                status={col.status}
                title={col.title}
                hint={col.hint}
                count={cards.length}
                dragFrom={dragFrom}
              >
                <ColumnCards cards={cards} ctx={ctx} />
              </BoardColumn>
            )
          })}
        </div>
        {/* Com "Recusada" oculta, uma faixa fixa recebe os cards recusados durante o arrasto. */}
        {showRejectZone(drag.dragging, showRejected) && <RejectDropZone />}
      </div>
      {/* Sem animação de soltar: o card já está na coluna nova (movido na hora). */}
      <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
        {drag.dragging && (
          <ProposalCard
            overlay
            proposal={drag.dragging}
            now={ctx.now}
            meId={ctx.meId}
            isTech={false}
            busy={false}
            onOpen={noop}
            onVote={noop}
            onRemoveVote={noop}
            onMove={noop}
            onDelete={noop}
          />
        )}
      </DragOverlay>
    </DndContext>
  )
}

export default ProposalBoardDnd
