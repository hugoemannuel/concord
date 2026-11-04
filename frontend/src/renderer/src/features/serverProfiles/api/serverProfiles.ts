import { request } from '../../../shared/api/client'
import { uploadImage, type CosmeticImageKind, type ProfileImageKind } from '../../profile/api/users'
import type { ServerProfileView } from '../lib/serverProfile'

const base = (serverId: string): string => `/servers/${encodeURIComponent(serverId)}/profile`

export type ServerMediaKind = ProfileImageKind | CosmeticImageKind

/** O meu perfil neste servidor, o apelido e se posso mudar o apelido. */
export function getServerProfile(serverId: string): Promise<ServerProfileView> {
  return request<ServerProfileView>(base(serverId))
}

/** Campo ausente não muda; null volta ao padrão; valor sobrescreve. */
export function patchServerProfile(
  serverId: string,
  patch: Record<string, unknown>
): Promise<ServerProfileView> {
  return request<ServerProfileView>(base(serverId), { method: 'PATCH', body: JSON.stringify(patch) })
}

/** Apaga o perfil deste servidor: volto a ser só o perfil global. */
export function deleteServerProfile(serverId: string): Promise<ServerProfileView> {
  return request<ServerProfileView>(base(serverId), { method: 'DELETE' })
}

export function uploadServerProfileImage(
  serverId: string,
  kind: ServerMediaKind,
  file: Blob,
  staticFrame?: Blob,
  onProgress?: (fraction: number) => void
): Promise<ServerProfileView> {
  return uploadImage<ServerProfileView>(`${base(serverId)}/${kind}`, kind, file, staticFrame, onProgress)
}

/** A imagem volta a herdar do perfil global. */
export function resetServerProfileImage(
  serverId: string,
  kind: ServerMediaKind
): Promise<ServerProfileView> {
  return request<ServerProfileView>(`${base(serverId)}/${kind}`, { method: 'DELETE' })
}
