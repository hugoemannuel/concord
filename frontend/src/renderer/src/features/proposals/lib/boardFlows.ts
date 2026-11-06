import { ApiError } from '../../../shared/api/client'
import { errorMessage } from '../../../shared/lib/errorMessage'
import type { Proposal, ProposalStatus } from '../api/proposals'
import { canDropOn, needsCloseConfirm, needsTakeover } from './proposals'

/** Mudança de coluna à espera de confirmação (encerrar votação ou tomar a tarefa). */
export interface PendingMove {
  id: string
  status: ProposalStatus
}

/** O que as ações do quadro usam de fora (estado da tela, store e avisos). */
export interface BoardActionDeps {
  setBusyId: (id: string | null) => void
  fetchProposals: () => unknown
  info: (message: string) => void
  error: (message: string) => void
}

const isApiCode = (err: unknown, code: string): boolean => err instanceof ApiError && err.code === code

/**
 * Roda uma ação de um card com ele marcado como ocupado. Votação que terminou no
 * meio avisa e recarrega o quadro; outro erro vira toast.
 */
export async function runBoardAction(
  deps: BoardActionDeps,
  id: string,
  action: () => Promise<void>,
  fallback: string
): Promise<void> {
  deps.setBusyId(id)
  try {
    await action()
  } catch (err) {
    if (isApiCode(err, 'voting_closed')) {
      deps.info('A votação dessa proposta já terminou.')
      deps.fetchProposals()
    } else {
      deps.error(errorMessage(err, fallback))
    }
  } finally {
    deps.setBusyId(null)
  }
}

export interface MoveDeps {
  setStatus: (id: string, status: ProposalStatus, takeOver: boolean) => Promise<void>
  fetchProposals: () => Promise<void>
  askTakeover: (pending: PendingMove) => void
}

/**
 * Move o card. O card já voltou sozinho se falhar (setStatus desfaz); recarregar
 * mostra o que mudou de verdade (por exemplo, outra pessoa moveu o mesmo card antes).
 */
export async function setStatusOrAskTakeover(
  deps: MoveDeps,
  id: string,
  status: ProposalStatus,
  takeOver: boolean
): Promise<void> {
  try {
    await deps.setStatus(id, status, takeOver)
  } catch (err) {
    await deps.fetchProposals()
    // Outro dev pegou o card no meio: confirma de novo, já com o nome dele.
    if (isApiCode(err, 'assignee_conflict')) {
      deps.askTakeover({ id, status })
      return
    }
    throw err
  }
}

export interface MoveRoutes {
  confirmClose: (pending: PendingMove) => void
  confirmTakeover: (pending: PendingMove) => void
  move: (id: string, status: ProposalStatus) => Promise<void>
}

/** Arrastando ou pelo menu "Mover para…": a mesma regra e as mesmas confirmações. */
export async function routeMove(
  card: Proposal | undefined,
  status: ProposalStatus,
  meId: string | null,
  routes: MoveRoutes
): Promise<void> {
  if (!card || !canDropOn(card.status, status)) return
  if (needsCloseConfirm(card)) return routes.confirmClose({ id: card.id, status })
  if (needsTakeover(card, meId, status)) return routes.confirmTakeover({ id: card.id, status })
  await routes.move(card.id, status)
}

export interface DropRoutes {
  votingClosed: () => void
  move: (id: string, status: ProposalStatus) => void
}

/** Soltou o card arrastado sobre `overId` (a coluna, ou null fora de uma). */
export function routeDrop(card: Proposal | undefined, overId: string | null, routes: DropRoutes): void {
  if (!card || overId == null) return
  const target = overId as ProposalStatus
  if (target === 'voting' && card.status !== 'voting') return routes.votingClosed()
  if (canDropOn(card.status, target)) routes.move(card.id, target)
}

/** O card com esse id, ou null (sem id, ou card que sumiu). */
export function findProposal(proposals: Proposal[], id: string | null): Proposal | null {
  if (!id) return null
  return proposals.find((p) => p.id === id) ?? null
}

/**
 * A confirmação pendente com o card atual, se ainda faz sentido mostrá-la
 * (a votação pode ter acabado, ou o card sumido, com ela aberta).
 */
export function pendingTarget(
  proposals: Proposal[],
  pending: PendingMove | null,
  stillNeeded: (card: Proposal) => boolean
): { card: Proposal; status: ProposalStatus } | null {
  const card = findProposal(proposals, pending?.id ?? null)
  if (!pending || !card || !stillNeeded(card)) return null
  return { card, status: pending.status }
}

/** Proposta que não existe mais (apagada, ou link antigo): fecha o modal. */
export function shouldDropSelection(selectedId: string | null, loading: boolean, selected: Proposal | null): boolean {
  return Boolean(selectedId) && !loading && !selected
}

/** O card aberto tem menção pendente para quem está vendo? */
export function hasMentionFor(mentions: { proposal_id: string }[], selectedId: string | null): boolean {
  return selectedId ? mentions.some((m) => m.proposal_id === selectedId) : false
}

/** Com "Recusada" oculta, uma faixa fixa recebe os cards recusados durante o arrasto. */
export function showRejectZone(dragging: Proposal | null, showRejected: boolean): boolean {
  return !!dragging && !showRejected && dragging.status !== 'rejected'
}
