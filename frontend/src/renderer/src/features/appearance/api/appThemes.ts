import { ApiError, refreshTokens, request } from '../../../shared/api/client'
import { API_BASE_URL } from '../../../shared/lib/config'
import { useAuthStore } from '../../auth/store/authStore'
import type { CustomTheme } from '../lib/customThemes'

/** O que o servidor devolve (normalizeCustomThemes limpa). */
export interface AppThemesResponse {
  themes?: unknown
}

export function getAppThemes(): Promise<AppThemesResponse> {
  return request<AppThemesResponse>('/users/me/app-themes')
}

/** Troca a lista inteira de temas próprios da pessoa. */
export function saveAppThemes(themes: CustomTheme[]): Promise<AppThemesResponse> {
  return request<AppThemesResponse>('/users/me/app-themes', {
    method: 'PUT',
    body: JSON.stringify({ themes })
  })
}

async function sendImage(file: Blob, token: string | null): Promise<string> {
  const form = new FormData()
  form.append('file', file, 'fundo')
  const res = await fetch(`${API_BASE_URL}/users/me/app-themes/image`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form
  })
  const body = (await res.json().catch(() => ({}))) as { error?: string; url?: string }
  if (!res.ok || !body.url) throw new ApiError(res.status, body.error ?? `Upload failed: ${res.status}`)
  return body.url
}

/** Envia a imagem de fundo e devolve a URL que o tema guarda em `image`. */
export async function uploadThemeImage(file: Blob): Promise<string> {
  const token = useAuthStore.getState().accessToken
  try {
    return await sendImage(file, token)
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && token && (await refreshTokens())) {
      return sendImage(file, useAuthStore.getState().accessToken)
    }
    throw err
  }
}
