import { request } from '../../../shared/api/client'
import type { AppSoundSettings } from '../lib/choice'
import type { SoundEvent } from '../lib/events'

/** O que o servidor devolve (normalizeAppSounds limpa). */
export type AppSoundsResponse = Record<string, unknown>

export function getAppSounds(): Promise<AppSoundsResponse> {
  return request<AppSoundsResponse>('/users/me/app-sounds')
}

export function saveAppSounds(settings: AppSoundSettings): Promise<AppSoundsResponse> {
  return request<AppSoundsResponse>('/users/me/app-sounds', {
    method: 'PUT',
    body: JSON.stringify(settings)
  })
}

/** Sobe o áudio do evento: o corpo é o arquivo e a duração medida vai na URL. */
export function uploadAppSound(event: SoundEvent, file: File, durationMs: number): Promise<AppSoundsResponse> {
  return request<AppSoundsResponse>(`/users/me/app-sounds/${event}?duration_ms=${Math.round(durationMs)}`, {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file
  })
}

export function deleteAppSound(event: SoundEvent): Promise<AppSoundsResponse> {
  return request<AppSoundsResponse>(`/users/me/app-sounds/${event}`, { method: 'DELETE' })
}
