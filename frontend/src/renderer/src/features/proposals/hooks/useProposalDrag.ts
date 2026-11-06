import { useState } from 'react'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import type { Proposal, ProposalStatus } from '../api/proposals'
import { showToast } from '../../../shared/store/toastStore'
import { findProposal, routeDrop } from '../lib/boardFlows'

/** Card sendo arrastado no quadro; soltar numa coluna pede a mudança (com as mesmas regras do menu). */
export function useProposalDrag(
  proposals: Proposal[],
  requestMove: (id: string, status: ProposalStatus) => Promise<void>
) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const endDrag = (): void => setDraggingId(null)

  return {
    dragging: findProposal(proposals, draggingId),
    onDragStart: (event: DragStartEvent): void => setDraggingId(String(event.active.id)),
    onDragCancel: endDrag,
    onDragEnd: (event: DragEndEvent): void => {
      endDrag()
      routeDrop(proposals.find((p) => p.id === event.active.id), event.over ? String(event.over.id) : null, {
        votingClosed: () => showToast.info('Uma votação encerrada não reabre.'),
        move: (id, status) => void requestMove(id, status)
      })
    }
  }
}
