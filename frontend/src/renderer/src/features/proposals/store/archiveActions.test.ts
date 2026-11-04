import { beforeEach, describe, expect, it, vi } from 'vitest'

const archived = { archive: vi.fn(), unarchive: vi.fn(), archiveAll: vi.fn() }
vi.mock('./archivedProposalStore', () => ({
  useArchivedProposalStore: { getState: () => archived }
}))
const toast = { success: vi.fn(), error: vi.fn() }
const addToast = vi.fn()
vi.mock('../../../shared/store/toastStore', () => ({
  showToast: toast,
  useToastStore: { getState: () => ({ addToast }) }
}))

const { archiveAllWithToast, archiveWithUndo, unarchiveWithToast } = await import('./archiveActions')

beforeEach(() => vi.clearAllMocks())

describe('archiveWithUndo', () => {
  it('avisa com "Desfazer", que desarquiva o mesmo card', async () => {
    archived.archive.mockResolvedValue(undefined)
    archived.unarchive.mockResolvedValue(undefined)
    expect(await archiveWithUndo('p1')).toBe(true)
    const [message, type, , action] = addToast.mock.calls[0]
    expect([message, type, action.label]).toEqual(['1 proposta arquivada', 'success', 'Desfazer'])
    action.run()
    expect(archived.unarchive).toHaveBeenCalledWith('p1')
  })
  it('erro do servidor vira aviso de erro, sem "Desfazer"', async () => {
    archived.archive.mockRejectedValue(new Error('forbidden'))
    expect(await archiveWithUndo('p1')).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('forbidden')
    expect(addToast).not.toHaveBeenCalled()
  })
  it('erro sem mensagem usa o texto padrão', async () => {
    archived.archive.mockRejectedValue('x')
    await archiveWithUndo('p1')
    expect(toast.error).toHaveBeenCalledWith('Não foi possível arquivar a proposta.')
  })
})

describe('archiveAllWithToast', () => {
  it('diz quantas foram arquivadas', async () => {
    archived.archiveAll.mockResolvedValue(3)
    expect(await archiveAllWithToast('done')).toBe(true)
    expect(toast.success).toHaveBeenCalledWith('3 propostas arquivadas')
  })
  it('lote vazio avisa que não havia nada', async () => {
    archived.archiveAll.mockResolvedValue(0)
    await archiveAllWithToast('rejected')
    expect(toast.success).toHaveBeenCalledWith('Nada para arquivar')
  })
  it('falha avisa o erro', async () => {
    archived.archiveAll.mockRejectedValue(new Error('boom'))
    expect(await archiveAllWithToast('done')).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('boom')
  })
})

describe('unarchiveWithToast', () => {
  it('sucesso e falha', async () => {
    archived.unarchive.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('nope'))
    expect(await unarchiveWithToast('p1')).toBe(true)
    expect(toast.success).toHaveBeenCalledWith('Proposta devolvida ao quadro')
    expect(await unarchiveWithToast('p1')).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('nope')
  })
})
