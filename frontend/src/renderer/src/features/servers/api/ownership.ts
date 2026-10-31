import { request } from '../../../shared/api/client'
import type { Server } from './servers'

/** Passa o servidor para outro membro (só o dono). Os apps recebem server:update. */
export function transferOwnership(serverId: string, userId: string): Promise<Server> {
  return request<Server>(`/servers/${serverId}/owner`, {
    method: 'PUT',
    body: JSON.stringify({ user_id: userId })
  })
}
