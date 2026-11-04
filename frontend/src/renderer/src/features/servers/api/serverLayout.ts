import { request } from '../../../shared/api/client'
import type { RailLayoutItem } from '../lib/serverRailLayout'

interface ServerLayoutResponse {
  items: RailLayoutItem[]
}

export async function getServerLayout(): Promise<RailLayoutItem[]> {
  const res = await request<ServerLayoutResponse>('/users/me/server-layout')
  return Array.isArray(res?.items) ? res.items : []
}

export async function saveServerLayout(items: RailLayoutItem[]): Promise<RailLayoutItem[]> {
  const res = await request<ServerLayoutResponse>('/users/me/server-layout', {
    method: 'PUT',
    body: JSON.stringify({ items })
  })
  return Array.isArray(res?.items) ? res.items : items
}
