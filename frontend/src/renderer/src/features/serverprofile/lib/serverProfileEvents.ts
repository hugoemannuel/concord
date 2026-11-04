import type { WsEvent } from '../../../shared/api/ws'
import type { ServerProfile, ServerTag } from '../api/serverProfile'

/** Para onde vai cada evento (ver serverProfileStart). */
export interface ServerProfileEventDeps {
  setProfile: (serverId: string, profile: ServerProfile) => void
  /** A tag do servidor mudou: o evento não a leva (o servidor pode ser privado). */
  refreshServerTag: (serverId: string) => void
  setUserTag: (userId: string, tag: ServerTag | null, leftServerId?: string) => void
}

interface EventPayload {
  server_id?: string
  user_id?: string
  profile?: ServerProfile
  tag?: ServerTag | null
  left_server_id?: string
}

type Handler = (p: EventPayload, deps: ServerProfileEventDeps) => void

const HANDLERS: Record<string, Handler> = {
  'server:profile': (p, deps) => {
    if (p.server_id && p.profile) deps.setProfile(p.server_id, p.profile)
  },
  'server:tag': (p, deps) => {
    if (p.server_id) deps.refreshServerTag(p.server_id)
  },
  'user:server_tag': (p, deps) => {
    if (p.user_id) deps.setUserTag(p.user_id, p.tag ?? null, p.left_server_id)
  }
}

/** Liga os eventos da customização do servidor aos stores. */
export function handleServerProfileEvent(event: WsEvent, deps: ServerProfileEventDeps): void {
  HANDLERS[event.type]?.((event.payload ?? {}) as EventPayload, deps)
}
