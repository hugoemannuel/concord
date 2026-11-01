import { request } from '../../../shared/api/client'
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
