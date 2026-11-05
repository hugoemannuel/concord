import type { MemberProfile } from './memberProfile'

/** O que os eventos acionam (injetado: o teste não sobe o store). */
export interface MemberProfileEventDeps {
  apply: (serverId: string, userId: string, profile: MemberProfile | null | undefined) => void
  forgetServer: (serverId: string) => void
}

interface MemberPayload {
  server_id?: string
  user_id?: string
  member?: { user_id?: string; member_profile?: MemberProfile | null }
}

/**
 * Eventos da sala server:<id>: membro atualizado traz o perfil do servidor;
 * sair, ser expulso ou o servidor sumir apagam o perfil (no backend também).
 */
export function handleMemberProfileEvent(
  event: { type: string; payload?: unknown },
  deps: MemberProfileEventDeps
): void {
  const payload = (event.payload ?? {}) as MemberPayload
  const serverId = payload.server_id
  if (!serverId) return
  if (event.type === 'server:member:update' || event.type === 'server:member:join') {
    if (payload.member?.user_id) deps.apply(serverId, payload.member.user_id, payload.member.member_profile)
  } else if (event.type === 'server:member:leave') {
    if (payload.user_id) deps.apply(serverId, payload.user_id, null)
  } else if (event.type === 'server:removed' || event.type === 'server:delete') {
    deps.forgetServer(serverId)
  }
}
