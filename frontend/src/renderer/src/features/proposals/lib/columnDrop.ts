import type { ProposalStatus } from '../api/proposals'
import { canDropOn } from './proposals'

export interface ColumnDrop {
  /** Classes de borda/fundo da coluna durante o arrasto. */
  state: string
  /** Texto de apoio sob o título (avisa que a votação não reabre). */
  hint: string
}

/**
 * Como a coluna se mostra durante um arrasto (`dragFrom` é a coluna de origem,
 * nulo sem arrasto): acende quando aceita o card, fica tracejada e com cursor
 * de proibido quando não. Nada muda de tamanho.
 */
export function columnDrop(
  dragFrom: ProposalStatus | null,
  status: ProposalStatus,
  isOver: boolean,
  hint: string
): ColumnDrop {
  if (dragFrom == null) return { state: 'border-subtle', hint }
  if (canDropOn(dragFrom, status)) {
    return { state: isOver ? 'border-violet-400 bg-violet-500/10' : 'border-violet-400/30', hint }
  }
  if (dragFrom === status) return { state: 'border-subtle', hint }
  return {
    state: `cursor-not-allowed border-dashed ${isOver ? 'border-red-400/70' : 'border-subtle'}`,
    hint: status === 'voting' ? 'A votação não reabre' : hint
  }
}
