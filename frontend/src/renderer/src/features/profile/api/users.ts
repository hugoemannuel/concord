import { request, ApiError, refreshTokens } from '../../../shared/api/client'
import { API_BASE_URL } from '../../../shared/lib/config'
import { useAuthStore, type ProfileLink, type PublicUser, type User } from '../../auth/store/authStore'
import type { ChosenStatus, PresenceStatus } from '../../friends/lib/presenceStatus'
import type { ProfileFields } from '../lib/profileValidation'
import type { NameStyle } from '../lib/nameStyle'
import type { ProfileTheme } from '../lib/profileTheme'
import type { ProfileRelationship } from '../lib/profileRelationship'

export function getMe(): Promise<User> {
  return request<User>('/users/me')
}

export function searchUsers(username: string): Promise<PublicUser[]> {
  return request<PublicUser[]>(`/users/search?username=${encodeURIComponent(username)}`)
}

/** O que os outros veem no cartão de perfil (sem e-mail; status efetivo). */
export interface PublicProfile {
  id: string
  username: string
  display_name: string
  avatar_url?: string | null
  banner_url?: string | null
  banner_color?: string | null
  pronouns: string
  bio: string
  status_text: string
  links: ProfileLink[]
  status: PresenceStatus
  is_bot?: boolean
  name_style?: NameStyle
  /** Borda, fundo e efeito do cartão (ausente = padrão). */
  profile_theme?: ProfileTheme
  /** Faixa efetiva (o banner ou a imagem própria); ausente = sem faixa. */
  nameplate_url?: string | null
  /** Moldura do avatar; ausente = sem moldura. */
  avatar_decoration_url?: string | null
  /** Vínculo comigo; sem vínculo (none), username vem vazio. Não vem no user:update. */
  relationship?: ProfileRelationship
  created_at: string
}

export function getProfile(userId: string): Promise<PublicProfile> {
  return request<PublicProfile>(`/users/${encodeURIComponent(userId)}/profile`)
}

export function updateProfile(fields: ProfileFields): Promise<User> {
  return request<User>('/users/me/profile', {
    method: 'PUT',
    body: JSON.stringify({ ...fields, links: fields.links.map((url) => ({ url })) })
  })
}

export function setStatus(status: ChosenStatus): Promise<User> {
  return request<User>('/users/me/status', { method: 'PUT', body: JSON.stringify({ status }) })
}

export type ProfileImageKind = 'avatar' | 'banner'

export function deleteProfileImage(kind: ProfileImageKind): Promise<User> {
  return request<User>(`/users/me/${kind}`, { method: 'DELETE' })
}

/**
 * Sobe o avatar/banner. GIF vai com o primeiro quadro em "static" (o app
 * mostra parado nas listas). XMLHttpRequest pelo progresso e sem o limite de
 * 15 s do request (10 MB numa conexão lenta demora).
 */
export function uploadProfileImage(
  kind: ProfileImageKind,
  file: Blob,
  staticFrame?: Blob,
  onProgress?: (fraction: number) => void
): Promise<User> {
  return uploadImage<User>(`/users/me/${kind}`, kind, file, staticFrame, onProgress)
}

/** Mesmo upload do avatar, para o caminho dado (ícone do grupo também usa). */
export async function uploadImage<T>(
  path: string,
  name: string,
  file: Blob,
  staticFrame?: Blob,
  onProgress?: (fraction: number) => void
): Promise<T> {
  const token = useAuthStore.getState().accessToken
  try {
    return await sendImage<T>(path, name, file, staticFrame, onProgress, token)
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && token && (await refreshTokens(token))) {
      return sendImage<T>(
        path,
        name,
        file,
        staticFrame,
        onProgress,
        useAuthStore.getState().accessToken
      )
    }
    throw err
  }
}

const UPLOAD_ERRORS: Record<number, string> = {
  413: 'A imagem pode ter até 10 MB.',
  415: 'Use uma imagem PNG, JPG, GIF ou WebP.',
  507: 'O servidor está sem espaço agora. Tente mais tarde.'
}

function sendImage<T>(
  path: string,
  name: string,
  file: Blob,
  staticFrame: Blob | undefined,
  onProgress: ((fraction: number) => void) | undefined,
  token: string | null
): Promise<T> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file, name)
    if (staticFrame) form.append('static', staticFrame, `${name}-static`)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE_URL}${path}`)
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && e.total > 0) onProgress?.(e.loaded / e.total)
    })
    xhr.onload = () => {
      let body: unknown = {}
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        // corpo vazio ou não-JSON
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as T)
      } else {
        const message =
          UPLOAD_ERRORS[xhr.status] ?? (body as { error?: string }).error ?? 'Falha no envio'
        reject(new ApiError(xhr.status, message))
      }
    }
    xhr.onerror = () => reject(new ApiError(0, 'Sem conexão com o servidor.'))
    xhr.send(form)
  })
}

/** Quem pode mandar pedido de amizade (Privacidade e segurança). */
export type FriendRequestPolicy = 'everyone' | 'mutual_friends' | 'mutual_servers' | 'nobody'

export interface Privacy {
  friend_request_policy: FriendRequestPolicy
  /** Membros de servidores em comum (sem amizade) podem mandar DM. */
  allow_server_dms: boolean
}

export function getPrivacy(): Promise<Privacy> {
  return request<Privacy>('/users/me/privacy')
}

export function updatePrivacy(privacy: Privacy): Promise<Privacy> {
  return request<Privacy>('/users/me/privacy', { method: 'PUT', body: JSON.stringify(privacy) })
}
