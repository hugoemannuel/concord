import { request } from '../../../shared/api/client'
import { uploadImage, type CosmeticImageKind, type ProfileImageKind } from '../../profile/api/users'
import type { MemberProfileView } from '../lib/memberProfile'

const base = (serverId: string): string => `/servers/${encodeURIComponent(serverId)}/my-profile`

export type ServerMediaKind = ProfileImageKind | CosmeticImageKind

/** O meu perfil neste servidor, o apelido e se posso mudar o apelido. */
export function getMemberProfile(serverId: string): Promise<MemberProfileView> {
  return request<MemberProfileView>(base(serverId))
}

/** Campo ausente não muda; null volta ao padrão; valor sobrescreve. */
export function patchMemberProfile(
  serverId: string,
  patch: Record<string, unknown>
): Promise<MemberProfileView> {
  return request<MemberProfileView>(base(serverId), { method: 'PATCH', body: JSON.stringify(patch) })
}

/** Apaga o perfil deste servidor: volto a ser só o perfil global. */
export function deleteMemberProfile(serverId: string): Promise<MemberProfileView> {
  return request<MemberProfileView>(base(serverId), { method: 'DELETE' })
}

export function uploadMemberProfileImage(
  serverId: string,
  kind: ServerMediaKind,
  file: Blob,
  staticFrame?: Blob,
  onProgress?: (fraction: number) => void
): Promise<MemberProfileView> {
  return uploadImage<MemberProfileView>(`${base(serverId)}/${kind}`, kind, file, staticFrame, onProgress)
}

/** A imagem volta a herdar do perfil global. */
export function resetMemberProfileImage(
  serverId: string,
  kind: ServerMediaKind
): Promise<MemberProfileView> {
  return request<MemberProfileView>(`${base(serverId)}/${kind}`, { method: 'DELETE' })
}
