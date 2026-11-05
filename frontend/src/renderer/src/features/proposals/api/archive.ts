import { request } from '../../../shared/api/client'
import type { Proposal, ProposalStatus } from './proposals'

/** Uma página das propostas arquivadas (a mais recente primeiro). */
export interface ArchivedPage {
  proposals: Proposal[]
  has_more: boolean
}

/** Só estes status podem ser arquivados. */
export type ArchivableStatus = Extract<ProposalStatus, 'done' | 'rejected'>

export function archiveProposal(id: string): Promise<Proposal> {
  return request<Proposal>(`/proposals/${id}/archive`, { method: 'PUT' })
}

export function unarchiveProposal(id: string): Promise<Proposal> {
  return request<Proposal>(`/proposals/${id}/archive`, { method: 'DELETE' })
}

/** Arquiva de uma vez todas as concluídas (ou recusadas); devolve as ids arquivadas. */
export async function archiveAllProposals(status: ArchivableStatus): Promise<string[]> {
  const res = await request<{ ids: string[] }>('/proposals/archive-all', {
    method: 'POST',
    body: JSON.stringify({ status })
  })
  return Array.isArray(res.ids) ? res.ids : []
}

export async function listArchivedProposals(page: number, query: string): Promise<ArchivedPage> {
  const params = new URLSearchParams({ page: String(page) })
  if (query.trim()) params.set('q', query.trim())
  const res = await request<ArchivedPage>(`/proposals/archived?${params.toString()}`)
  return { proposals: Array.isArray(res.proposals) ? res.proposals : [], has_more: !!res.has_more }
}
