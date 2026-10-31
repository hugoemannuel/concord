import { API_BASE_URL } from '../../../shared/lib/config'
import { useAuthStore } from '../../auth/store/authStore'
import { ApiError, refreshTokens, request } from '../../../shared/api/client'
import type { Recurrence } from '../lib/recurrence'

/** Evento do servidor, como o backend (internal/event) o manda. */
export interface ServerEvent {
  id: string
  server_id: string
  title: string
  description: string
  banner_id: string | null
  starts_at: string
  /** A ocorrência atual (a que vale para presença e avisos). */
  next_start_at: string
  /** A sala fecha quando a duração acaba. */
  duration_minutes: number
  /** O jogo do evento (nome); null = sem jogo. */
  game_name: string | null
  /** A sala da ocorrência em andamento (voz e texto); null fora do horário do evento. */
  voice_channel_id: string | null
  text_channel_id: string | null
  recurrence: Recurrence
  recurrence_until: string | null
  recurrence_count: number | null
  reminder_offsets: number[]
  created_by: string | null
  going_count: number
  /** true = vou, false = não vou, null = sem resposta. */
  my_rsvp: boolean | null
}

/** O que o formulário manda ao criar ou editar. */
export interface EventInput {
  title: string
  description: string
  banner_id: string | null
  starts_at: string
  duration_minutes: number
  /** O nome do jogo ('' = sem jogo). */
  game_name: string
  recurrence: Recurrence
  recurrence_until: string | null
  recurrence_count: number | null
  reminder_offsets: number[]
}

/** O que a pessoa pode fazer com os eventos do servidor (o dono escolhe, cargo a cargo). */
export interface EventAccess {
  create: boolean
  edit: boolean
  delete: boolean
  /** Abre a configuração dos eventos (o dono sempre). */
  configure: boolean
  owner: boolean
}

/** Um cargo e o que ele pode fazer com os eventos. */
export interface RoleSetting {
  role_id: string
  name: string
  create: boolean
  edit: boolean
  delete: boolean
  configure: boolean
}

export interface RoleActions {
  create: boolean
  edit: boolean
  delete: boolean
  /** Só vale se quem grava é o dono; para os outros o servidor mantém o que o cargo já tem. */
  configure?: boolean
}

export interface EventGoing {
  user_id: string
  username: string
  display_name: string
}

export const MAX_BANNER_BYTES = 10 * 1024 * 1024
export const BANNER_ACCEPT = 'image/png,image/jpeg,image/webp'

const base = (serverId: string): string => `/servers/${encodeURIComponent(serverId)}/events`

export function fetchEvents(serverId: string): Promise<ServerEvent[]> {
  return request<ServerEvent[]>(base(serverId))
}

export function createEvent(serverId: string, input: EventInput): Promise<ServerEvent> {
  return request<ServerEvent>(base(serverId), { method: 'POST', body: JSON.stringify(input) })
}

export function updateEvent(
  serverId: string,
  eventId: string,
  input: EventInput
): Promise<ServerEvent> {
  return request<ServerEvent>(`${base(serverId)}/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input)
  })
}

export function cancelEvent(serverId: string, eventId: string): Promise<void> {
  return request<void>(`${base(serverId)}/${encodeURIComponent(eventId)}`, { method: 'DELETE' })
}

export function setRsvp(serverId: string, eventId: string, going: boolean): Promise<void> {
  return request<void>(`${base(serverId)}/${encodeURIComponent(eventId)}/rsvp`, {
    method: 'PUT',
    body: JSON.stringify({ going })
  })
}

export function clearRsvp(serverId: string, eventId: string): Promise<void> {
  return request<void>(`${base(serverId)}/${encodeURIComponent(eventId)}/rsvp`, {
    method: 'DELETE'
  })
}

export function fetchEventAccess(serverId: string): Promise<EventAccess> {
  return request<EventAccess>(`${base(serverId)}/access`)
}

export function fetchRoleSettings(serverId: string): Promise<RoleSetting[]> {
  return request<RoleSetting[]>(`${base(serverId)}/roles`)
}

export function saveRoleActions(serverId: string, roleId: string, actions: RoleActions): Promise<void> {
  return request<void>(`${base(serverId)}/roles/${encodeURIComponent(roleId)}`, {
    method: 'PUT',
    body: JSON.stringify(actions)
  })
}

export function fetchGoing(serverId: string, eventId: string): Promise<EventGoing[]> {
  return request<EventGoing[]>(`${base(serverId)}/${encodeURIComponent(eventId)}/rsvps`)
}

export function eventBannerUrl(bannerId: string, mediaToken: string): string {
  return `${API_BASE_URL}/event-banners/${encodeURIComponent(bannerId)}?token=${encodeURIComponent(mediaToken)}`
}

/** Envia o banner e devolve o id do arquivo, que o evento guarda em `banner_id`. */
export async function uploadEventBanner(serverId: string, file: Blob): Promise<string> {
  const token = useAuthStore.getState().accessToken
  try {
    return await sendBanner(serverId, file, token)
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && token && (await refreshTokens())) {
      return sendBanner(serverId, file, useAuthStore.getState().accessToken)
    }
    throw err
  }
}

async function sendBanner(serverId: string, file: Blob, token: string | null): Promise<string> {
  const form = new FormData()
  form.append('file', file, 'banner')
  const res = await fetch(`${API_BASE_URL}${base(serverId)}/banner`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form
  })
  const body = (await res.json().catch(() => ({}))) as {
    error?: string
    code?: string
    banner_id?: string
  }
  if (!res.ok || !body.banner_id) {
    throw new ApiError(res.status, body.error ?? `Upload failed: ${res.status}`, body.code)
  }
  return body.banner_id
}
