import { request } from '../../../shared/api/client'

export interface Category { id: string; name: string; position: number }
export interface ChannelPlacement { channel_id: string; category_id: string | null; position: number }
export interface CategoryLayout { categories: Category[]; channels: ChannelPlacement[] }

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
export function moveCategory(serverId: string, id: string, direction: 'up' | 'down'): Promise<void> {
  return request(`${path(serverId)}/${id}/order`, { method: 'PUT', body: JSON.stringify({ direction }) })
}
export function moveCategoryChannel(serverId: string, channelId: string, categoryId: string | null, beforeId: string | null = null): Promise<void> {
  return request(`${path(serverId)}/channels/${channelId}`, {
    method: 'PUT', body: JSON.stringify({ category_id: categoryId, before_id: beforeId })
  })
}
