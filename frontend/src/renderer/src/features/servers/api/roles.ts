import { request } from '../../../shared/api/client'
import type { Role } from '../lib/permissions'

export type { Role }

/** Campos editáveis de um cargo; o que não vai não muda. */
export interface RoleInput {
  name?: string
  /** Cor RGB (0xRRGGBB). */
  color?: number
  /** Tira a cor do cargo. */
  clear_color?: boolean
  hoist?: boolean
  /** Qualquer pessoa pode mencionar o cargo no chat. */
  mentionable?: boolean
  permissions?: number
}

export function createRole(serverId: string, input: RoleInput): Promise<Role> {
  return request<Role>(`/servers/${serverId}/roles`, {
    method: 'POST',
    body: JSON.stringify(input)
  })
}

export function updateRole(serverId: string, roleId: string, input: RoleInput): Promise<Role> {
  return request<Role>(`/servers/${serverId}/roles/${roleId}`, {
    method: 'PATCH',
    body: JSON.stringify(input)
  })
}

export function deleteRole(serverId: string, roleId: string): Promise<void> {
  return request<void>(`/servers/${serverId}/roles/${roleId}`, { method: 'DELETE' })
}

/** Os meus cargos em cada servidor: id do servidor -> ids dos cargos (sem o @everyone). */
export function listMyServerRoles(): Promise<Record<string, string[]>> {
  return request<Record<string, string[]>>('/users/me/server-roles')
}

/** Nova ordem dos cargos (sem o @everyone), do mais alto para o mais baixo. */
export function reorderRoles(serverId: string, roleIds: string[]): Promise<Role[]> {
  return request<Role[]>(`/servers/${serverId}/roles/order`, {
    method: 'PUT',
    body: JSON.stringify({ role_ids: roleIds })
  })
}

export function addMemberRole(
  serverId: string,
  userId: string,
  roleId: string
): Promise<{ user_id: string; role_ids: string[] }> {
  return request(`/servers/${serverId}/members/${userId}/roles/${roleId}`, { method: 'PUT' })
}

export function removeMemberRole(
  serverId: string,
  userId: string,
  roleId: string
): Promise<{ user_id: string; role_ids: string[] }> {
  return request(`/servers/${serverId}/members/${userId}/roles/${roleId}`, { method: 'DELETE' })
}
