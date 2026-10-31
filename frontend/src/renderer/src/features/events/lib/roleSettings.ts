import { saveRoleActions, type RoleActions, type RoleSetting } from '../api/events'
import { eventErrorMessage } from './eventErrors'

// A configuração dos eventos por cargo: o que cada cargo faz com os eventos do
// servidor (vale para todos). As quatro ações, na ordem da tela.

export type RoleAction = 'create' | 'edit' | 'delete' | 'configure'

export const ROLE_ACTIONS: { key: RoleAction; label: string; ownerOnly?: boolean }[] = [
  { key: 'create', label: 'Criar eventos' },
  { key: 'edit', label: 'Editar eventos' },
  { key: 'delete', label: 'Excluir eventos' },
  // Abre esta configuração e escolhe criar, editar e excluir dos cargos; só o dono dá ou tira.
  { key: 'configure', label: 'Configurar eventos', ownerOnly: true }
]

/** A lista com uma ação ligada ou desligada num cargo (sem mexer na original). */
export function withAction(
  roles: RoleSetting[],
  roleId: string,
  action: RoleAction,
  value: boolean
): RoleSetting[] {
  return roles.map((r) => (r.role_id === roleId ? { ...r, [action]: value } : r))
}

/** O que mandar ao servidor para o cargo: as quatro chaves como estão na lista. */
export function actionsFor(roles: RoleSetting[], roleId: string): RoleActions | null {
  const role = roles.find((r) => r.role_id === roleId)
  if (!role) return null
  return { create: role.create, edit: role.edit, delete: role.delete, configure: role.configure }
}

/**
 * Grava no servidor o que o cargo pode (já com a mudança aplicada na lista).
 * Devolve o texto do problema, ou null se deu certo (ou se o cargo não existe).
 */
export async function persistRoleChange(
  serverId: string,
  roles: RoleSetting[],
  roleId: string,
  save: typeof saveRoleActions = saveRoleActions
): Promise<string | null> {
  const actions = actionsFor(roles, roleId)
  if (!actions) return null
  try {
    await save(serverId, roleId, actions)
    return null
  } catch (err) {
    return eventErrorMessage(err)
  }
}
