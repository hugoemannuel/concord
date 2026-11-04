import { showToast, useToastStore } from '../../../shared/store/toastStore'
import type { ArchivableStatus } from '../api/archive'
import { archivedToast } from '../lib/archive'
import { useArchivedProposalStore } from './archivedProposalStore'

const errorText = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback

/** Devolve o card ao quadro, avisando o resultado. */
export async function unarchiveWithToast(id: string): Promise<boolean> {
  try {
    await useArchivedProposalStore.getState().unarchive(id)
    showToast.success('Proposta devolvida ao quadro')
    return true
  } catch (err) {
    showToast.error(errorText(err, 'Não foi possível desarquivar a proposta.'))
    return false
  }
}

/** Arquiva um card; o aviso traz "Desfazer" (desarquiva na hora). */
export async function archiveWithUndo(id: string): Promise<boolean> {
  try {
    await useArchivedProposalStore.getState().archive(id)
  } catch (err) {
    showToast.error(errorText(err, 'Não foi possível arquivar a proposta.'))
    return false
  }
  useToastStore.getState().addToast(archivedToast(1), 'success', 6000, {
    label: 'Desfazer',
    run: () => void unarchiveWithToast(id)
  })
  return true
}

/** Arquiva todas as concluídas (ou recusadas) de uma vez. */
export async function archiveAllWithToast(status: ArchivableStatus): Promise<boolean> {
  try {
    const count = await useArchivedProposalStore.getState().archiveAll(status)
    showToast.success(count === 0 ? 'Nada para arquivar' : archivedToast(count))
    return true
  } catch (err) {
    showToast.error(errorText(err, 'Não foi possível arquivar as propostas.'))
    return false
  }
}
