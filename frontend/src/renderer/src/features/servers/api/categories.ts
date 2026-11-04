import { request } from '../../../shared/api/client'

export interface Category { id: string; name: string; position: number }
export interface ChannelPlacement { channel_id: string; category_id: string | null; position: number }
export interface CategoryLayout {
  categories: Category[]
  channels: ChannelPlacement[]
  /** Identifica a lista lida: volta na gravação para o servidor recusar se ela mudou. */
  revision?: string
}
export interface CategoryLayoutWrite { categories: string[]; channels: ChannelPlacement[] }

const path = (serverId: string): string => `/servers/${serverId}/categories`

export function listCategories(serverId: string): Promise<CategoryLayout> {
  return request(path(serverId))
}
export function createCategory(serverId: string, name: string): Promise<void> {
  return request(path(serverId), { method: 'POST', body: JSON.stringify({ name }) })
}
export function renameCategory(serverId: string, id: string, name: string): Promise<void> {
  return request(`${path(serverId)}/${id}`, { method: 'PUT', body: JSON.stringify({ name }) })
}
export function deleteCategory(serverId: string, id: string): Promise<void> {
  return request(`${path(serverId)}/${id}`, { method: 'DELETE' })
}
/** Grava a organização inteira de uma vez; 409 se a lista mudou depois de `revision`. */
export function saveCategoryLayout(serverId: string, write: CategoryLayoutWrite, revision: string): Promise<{ revision: string }> {
  return request(`${path(serverId)}/layout`, { method: 'PUT', body: JSON.stringify({ ...write, revision }) })
}
