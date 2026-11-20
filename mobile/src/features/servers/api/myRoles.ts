import { request } from '../../../shared/api/client'

/** Os meus cargos em cada servidor: id do servidor -> ids dos cargos (sem o @everyone). */
export function listMyServerRoles(): Promise<Record<string, string[]>> {
  return request<Record<string, string[]>>('/users/me/server-roles')
}
