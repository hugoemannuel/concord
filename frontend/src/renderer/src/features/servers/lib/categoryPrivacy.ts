import type { Category, CategoryPrivacy } from '../api/categories'
import { Perm } from './permissions'

/** O que a opção "Categoria privada" mostra: quem está fechado e quem foi escolhido. */
export function privacyOf(category: Category | undefined, everyoneId: string | undefined): CategoryPrivacy {
  const rows = category?.overwrites ?? []
  const allowed = rows.filter((row) => (row.allow & Perm.VIEW_CHANNEL) !== 0)
  return {
    private: rows.some((row) => row.target_type === 'role' && row.target_id === everyoneId && (row.deny & Perm.VIEW_CHANNEL) !== 0),
    role_ids: allowed.filter((row) => row.target_type === 'role').map((row) => row.target_id),
    member_ids: allowed.filter((row) => row.target_type === 'member').map((row) => row.target_id)
  }
}

export function isPrivateCategory(category: Category | undefined, everyoneId: string | undefined): boolean {
  return privacyOf(category, everyoneId).private
}

const sameIds = (a: string[], b: string[]): boolean => a.length === b.length && a.every((id) => b.includes(id))

/** Só manda a privacidade se mudou: renomear não pode exigir gerenciar cargos. */
export function privacyChanged(before: CategoryPrivacy, after: CategoryPrivacy): boolean {
  if (before.private !== after.private) return true
  return after.private && !(sameIds(before.role_ids, after.role_ids) && sameIds(before.member_ids, after.member_ids))
}
