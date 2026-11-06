import { useState } from 'react'
import type { Proposal, ProposalStatus } from '../api/proposals'
import { showToast } from '../../../shared/store/toastStore'
import {
  pendingTarget,
  routeMove,
  runBoardAction,
  setStatusOrAskTakeover,
  type PendingMove
} from '../lib/boardFlows'
import { needsCloseConfirm } from '../lib/proposals'
import { useProposalStore } from '../store/proposalStore'

export interface ProposalActions {
  onVote: (approve: boolean) => Promise<void>
  onRemoveVote: () => Promise<void>
  onMove: (status: ProposalStatus) => Promise<void>
  onDelete: () => Promise<void>
}

const hasAssignee = (p: Proposal): boolean => !!p.assignee

const toasts = {
  info: (message: string) => showToast.info(message),
  error: (message: string) => showToast.error(message)
}

/** Ações dos cards do quadro (votar, mover, excluir) e as confirmações pendentes de mover. */
export function useProposalBoard(meId: string | null) {
  const proposals = useProposalStore((s) => s.proposals)
  const fetchProposals = useProposalStore((s) => s.fetchProposals)
  const vote = useProposalStore((s) => s.vote)
  const removeVote = useProposalStore((s) => s.removeVote)
  const setStatus = useProposalStore((s) => s.setStatus)
  const remove = useProposalStore((s) => s.remove)

  const [busyId, setBusyId] = useState<string | null>(null)
  // Mover um card em votação espera a confirmação do time tech.
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null)
  // Mover um card que está com outro dev pede confirmação (tira a tarefa dele).
  const [pendingTakeover, setPendingTakeover] = useState<PendingMove | null>(null)

  const run = (id: string, action: () => Promise<void>, fallback: string): Promise<void> =>
    runBoardAction({ setBusyId, fetchProposals, ...toasts }, id, action, fallback)

  const moveDeps = { setStatus, fetchProposals, askTakeover: setPendingTakeover }
  const move = (id: string, status: ProposalStatus, takeOver = false): Promise<void> =>
    run(id, () => setStatusOrAskTakeover(moveDeps, id, status, takeOver), 'Não foi possível mover a proposta.')

  const requestMove = (id: string, status: ProposalStatus): Promise<void> =>
    routeMove(proposals.find((p) => p.id === id), status, meId, {
      confirmClose: setPendingMove,
      confirmTakeover: setPendingTakeover,
      move
    })

  const actions = (id: string): ProposalActions => ({
    onVote: (approve) => run(id, () => vote(id, approve), 'Não foi possível votar.'),
    onRemoveVote: () => run(id, () => removeVote(id), 'Não foi possível retirar o voto.'),
    onMove: (status) => requestMove(id, status),
    onDelete: () => run(id, () => remove(id), 'Não foi possível excluir a proposta.')
  })

  return {
    busyId,
    actions,
    requestMove,
    // Se a votação acabou (ou o card sumiu) com a confirmação aberta, não há mais o que confirmar.
    closeConfirm: pendingTarget(proposals, pendingMove, needsCloseConfirm),
    takeoverConfirm: pendingTarget(proposals, pendingTakeover, hasAssignee),
    cancelClose: () => setPendingMove(null),
    confirmClose: (target: PendingMove) => {
      setPendingMove(null)
      void move(target.id, target.status)
    },
    cancelTakeover: () => setPendingTakeover(null),
    confirmTakeover: (target: PendingMove) => {
      setPendingTakeover(null)
      void move(target.id, target.status, true)
    }
  }
}

export type ProposalBoard = ReturnType<typeof useProposalBoard>
