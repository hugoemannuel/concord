import { request } from '../../../shared/api/client'
import type { ChannelOverwrite, OverwriteTarget } from '../lib/permissions'

export interface Category {
  id: string
  name: string
  position: number
  /** Quem vê a categoria (só chega para quem já a enxerga). Apps de servidores antigos não mandam. */
  overwrites?: ChannelOverwrite[]
}
export interface ChannelPlacement {
  channel_id: string
  category_id: string | null
  position: number
  /** O canal segue as permissões da categoria dele. */
  synced?: boolean
}
export interface CategoryLayout {
  categories: Category[]
  channels: ChannelPlacement[]
  /** Identifica a lista lida: volta na gravação para o servidor recusar se ela mudou. */
  revision?: string
}
export interface CategoryLayoutWrite { categories: string[]; channels: ChannelPlacement[] }

/** A opção "Categoria privada" e quem foi escolhido nela. */
export interface CategoryPrivacy {
  private: boolean
  role_ids: string[]
  member_ids: string[]
}

const path = (serverId: string): string => `/servers/${serverId}/categories`

export function listCategories(serverId: string): Promise<CategoryLayout> {
  return request(path(serverId))
}
export function createCategory(serverId: string, name: string, privacy?: CategoryPrivacy): Promise<void> {
  return request(path(serverId), { method: 'POST', body: JSON.stringify({ name, ...privacy }) })
}
/** Sem `privacy`, só renomeia: mudar quem vê exige também gerenciar cargos. */
export function updateCategory(serverId: string, id: string, name: string, privacy?: CategoryPrivacy): Promise<void> {
  return request(`${path(serverId)}/${id}`, { method: 'PUT', body: JSON.stringify({ name, ...privacy }) })
}
export function deleteCategory(serverId: string, id: string): Promise<void> {
  return request(`${path(serverId)}/${id}`, { method: 'DELETE' })
}
export function setCategoryOverwrite(serverId: string, id: string, type: OverwriteTarget, targetId: string, allow: number, deny: number): Promise<void> {
  return request(`${path(serverId)}/${id}/overwrites/${type}/${targetId}`, { method: 'PUT', body: JSON.stringify({ allow, deny }) })
}
export function deleteCategoryOverwrite(serverId: string, id: string, type: OverwriteTarget, targetId: string): Promise<void> {
  return request(`${path(serverId)}/${id}/overwrites/${type}/${targetId}`, { method: 'DELETE' })
}
/** O canal volta a seguir a categoria e perde as regras próprias. */
export function syncChannelWithCategory(serverId: string, channelId: string): Promise<void> {
  return request(`${path(serverId)}/channels/${channelId}/sync`, { method: 'POST' })
}
/** Grava a organização inteira de uma vez; 409 se a lista mudou depois de `revision`. */
export function saveCategoryLayout(serverId: string, write: CategoryLayoutWrite, revision: string): Promise<{ revision: string }> {
  return request(`${path(serverId)}/layout`, { method: 'PUT', body: JSON.stringify({ ...write, revision }) })
}
