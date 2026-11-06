import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../auth/store/authStore'

// Menções pendentes nas propostas: um aviso só ao abrir o app, e a resposta
// vale depois de renovar o token, mas não depois de sair da conta.

const listProposalMentions = vi.fn()
vi.mock('../api/proposals', () => ({
  listProposalMentions: (...a: unknown[]) => listProposalMentions(...a)
}))
const toast = vi.hoisted(() => ({ info: vi.fn(), success: vi.fn(), error: vi.fn() }))
vi.mock('../../../shared/store/toastStore', () => ({ showToast: toast }))

const { useProposalStore } = await import('./proposalStore')

const mention = (proposal_id: string) => ({
  proposal_id,
  proposal_title: `Proposta ${proposal_id}`,
  author_name: 'Ana'
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  useProposalStore.getState().reset()
  useAuthStore.getState().clear()
  useAuthStore.getState().setTokens('A', 'R1')
})

describe('proposalStore.fetchMentions', () => {
  it('uma menção: avisa com o autor e o título, mesmo com o token renovado no meio', async () => {
    listProposalMentions.mockImplementation(async () => {
      useAuthStore.getState().setTokens('B', 'R2')
      return [mention('p1')]
    })
    await useProposalStore.getState().fetchMentions()
    expect(useProposalStore.getState().pendingMentions).toEqual([mention('p1')])
    expect(toast.info).toHaveBeenCalledWith('Ana te marcou na proposta "Proposta p1"')
  })

  it('várias: um aviso só; reler com menções já na lista não avisa de novo', async () => {
    listProposalMentions.mockResolvedValue([mention('p1'), mention('p2')])
    await useProposalStore.getState().fetchMentions()
    expect(toast.info).toHaveBeenCalledWith('Você foi marcado em 2 comentários de propostas')
    await useProposalStore.getState().fetchMentions()
    expect(toast.info).toHaveBeenCalledTimes(1)
  })

  it('nenhuma: não avisa', async () => {
    listProposalMentions.mockResolvedValue([])
    await useProposalStore.getState().fetchMentions()
    expect(toast.info).not.toHaveBeenCalled()
  })

  it('sair da conta no meio descarta; erro só loga', async () => {
    listProposalMentions.mockImplementation(async () => {
      useAuthStore.getState().clear()
      return [mention('p1')]
    })
    await useProposalStore.getState().fetchMentions()
    expect(useProposalStore.getState().pendingMentions).toEqual([])

    listProposalMentions.mockRejectedValue(new Error('x'))
    await useProposalStore.getState().fetchMentions()
    expect(useProposalStore.getState().pendingMentions).toEqual([])
    expect(toast.info).not.toHaveBeenCalled()
  })
})
