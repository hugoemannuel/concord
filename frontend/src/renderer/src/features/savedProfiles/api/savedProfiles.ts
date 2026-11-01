import { request } from '../../../shared/api/client'
import type { User } from '../../auth/store/authStore'
import type { SavedProfile } from '../lib/savedProfiles'

// Perfis salvos da própria conta (backend: internal/savedprofile).
const BASE = '/users/me/saved-profiles'
const one = (id: string): string => `${BASE}/${encodeURIComponent(id)}`

export function listSavedProfiles(): Promise<SavedProfile[]> {
  return request<SavedProfile[]>(BASE)
}

/** Salva o perfil atual (como está no servidor) com o nome dado. */
export function createSavedProfile(name: string): Promise<SavedProfile> {
  return request<SavedProfile>(BASE, { method: 'POST', body: JSON.stringify({ name }) })
}

export function renameSavedProfile(id: string, name: string): Promise<SavedProfile> {
  return request<SavedProfile>(one(id), { method: 'PATCH', body: JSON.stringify({ name }) })
}

/** Sobrescreve o perfil salvo com o perfil atual (mantém nome e posição). */
export function updateSavedProfile(id: string): Promise<SavedProfile> {
  return request<SavedProfile>(one(id), { method: 'PUT' })
}

export function deleteSavedProfile(id: string): Promise<void> {
  return request<void>(one(id), { method: 'DELETE' })
}

/** Troca o perfil atual pelo salvo; devolve a conta, como PUT /users/me/profile. */
export function applySavedProfile(id: string): Promise<User> {
  return request<User>(`${one(id)}/apply`, { method: 'POST' })
}
