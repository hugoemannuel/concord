import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Proposal } from '../api/proposals'
import { findProposal, hasMentionFor, shouldDropSelection } from '../lib/boardFlows'
import { useProposalStore } from '../store/proposalStore'

/** O card aberto fica na URL (?proposal=<id>): as notificações de menção abrem direto nele. */
export function useProposalSelection(proposals: Proposal[], loading: boolean) {
  const pendingMentions = useProposalStore((s) => s.pendingMentions)
  const markMentionsSeen = useProposalStore((s) => s.markMentionsSeen)
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('proposal')
  const selected = findProposal(proposals, selectedId)

  // Proposta que não existe mais (apagada, ou link antigo): fecha o modal.
  useEffect(() => {
    if (shouldDropSelection(selectedId, loading, selected)) setParams({}, { replace: true })
  }, [selectedId, selected, loading, setParams])

  // Quem abre o card vê as menções dele, inclusive as que chegam com o modal aberto.
  const hasMentionHere = hasMentionFor(pendingMentions, selectedId)
  useEffect(() => {
    if (selectedId && hasMentionHere) void markMentionsSeen(selectedId)
  }, [selectedId, hasMentionHere, markMentionsSeen])

  return {
    selected,
    open: (id: string) => setParams({ proposal: id }),
    close: () => setParams({})
  }
}
