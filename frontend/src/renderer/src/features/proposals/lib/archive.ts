import type { ArchivableStatus } from '../api/archive'
import type { Proposal, ProposalStatus } from '../api/proposals'
import { STATUS_ACTION_LABEL } from './proposals'

/** O time tech arquiva o card concluído ou recusado que ainda está no quadro. */
export function canArchive(p: Pick<Proposal, 'status' | 'archived_at'>, isTech: boolean): boolean {
  return isTech && !p.archived_at && (p.status === 'done' || p.status === 'rejected')
}

/** Tira da lista os cards que acabaram de ser arquivados. */
export function dropArchived(list: Proposal[], ids: string[]): Proposal[] {
  return ids.length === 0 ? list : list.filter((p) => !ids.includes(p.id))
}

/** Junta a próxima página sem repetir card (a lista anda enquanto se rola). */
export function mergePage(current: Proposal[], incoming: Proposal[]): Proposal[] {
  const fresh = new Map(incoming.map((p) => [p.id, p]))
  const kept = current.map((p) => fresh.get(p.id) ?? p)
  return [...kept, ...incoming.filter((p) => !current.some((c) => c.id === p.id))]
}

const COLUMN_NOUN: Record<ArchivableStatus, [string, string]> = {
  done: ['concluída', 'concluídas'],
  rejected: ['recusada', 'recusadas']
}

/** "Arquivar concluídas" (no singular com um card só). */
export function archiveCountLabel(status: ArchivableStatus, count: number): string {
  return `Arquivar ${COLUMN_NOUN[status][count === 1 ? 0 : 1]}`
}

const ARCHIVE_STATUS: Partial<Record<ProposalStatus, string>> = {
  done: 'Concluída',
  rejected: 'Recusada'
}

/** Status que aparece no cartão arquivado. */
export function archiveStatusLabel(status: ProposalStatus): string {
  return ARCHIVE_STATUS[status] ?? STATUS_ACTION_LABEL[status]
}

/** "1 proposta arquivada" / "3 propostas arquivadas". */
export function archivedToast(count: number): string {
  return count === 1 ? '1 proposta arquivada' : `${count} propostas arquivadas`
}

/** Texto da confirmação do "Arquivar concluídas/recusadas". */
export function archiveAllMessage(status: ArchivableStatus, count: number): string {
  const [one, many] = COLUMN_NOUN[status]
  const what = count === 1 ? `A proposta ${one} sai` : `As ${count} propostas ${many} saem`
  return `${what} do quadro para todo mundo. Nada é apagado: ${count === 1 ? 'ela fica' : 'elas ficam'} na aba Arquivadas e o time tech pode desarquivar.`
}

/** "Arquivada em 12 de out. de 2026". */
export function archivedOnLabel(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `Arquivada em ${date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

export type BoardTab = 'board' | 'archived'

/** Aba da URL (?aba=arquivadas); qualquer outro valor é o quadro. */
export function tabFromParam(param: string | null): BoardTab {
  return param === 'arquivadas' ? 'archived' : 'board'
}

/** Seta esquerda/direita troca de aba (só duas, então alterna); Home/End vão às pontas. */
export function tabForKey(current: BoardTab, key: string): BoardTab | null {
  if (key === 'ArrowLeft' || key === 'ArrowRight') return current === 'board' ? 'archived' : 'board'
  if (key === 'Home') return 'board'
  return key === 'End' ? 'archived' : null
}
