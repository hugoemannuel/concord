import { ApiError, request } from '../../../shared/api/client'
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

/** Envia a imagem de fundo e devolve a URL que o tema guarda em `image`. */
export async function uploadThemeImage(file: Blob): Promise<string> {
  const form = new FormData()
  form.append('file', file, 'fundo')
  // Sem o limite de 15 s: imagem grande numa conexão lenta demora.
  const body = await request<{ url?: string } | undefined>('/users/me/app-themes/image', {
    method: 'POST',
    body: form,
    timeoutMs: 0
  })
  if (!body?.url) throw new ApiError(0, 'Upload failed')
  return body.url
}
