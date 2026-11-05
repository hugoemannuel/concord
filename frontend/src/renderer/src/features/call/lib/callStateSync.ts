import type { CallStateResponse } from '../api/calls'
import type { CallKind, CallUserInfo, VoiceState } from '../store/callStore'

/** O que o estado local já tinha antes de ler o servidor. */
export interface LocalCallState {
  type: CallKind | null
  locked: boolean
  participants: CallUserInfo[]
  joinRequests: CallUserInfo[]
  voiceStates: Record<string, VoiceState>
  screenWatchers: Record<string, CallUserInfo[]>
  /** Eu transmito agora (há tela local publicada). */
  isScreenSharing: boolean
}

/** O pedaço do store que a leitura do estado da chamada atualiza. */
export interface SyncedCallState {
  locked: boolean
  participants: CallUserInfo[]
  joinRequests: CallUserInfo[]
  voiceStates: Record<string, VoiceState>
  screenSharers: string[]
  screenWatchers: Record<string, CallUserInfo[]>
}

const addMissing = (current: CallUserInfo[], incoming: CallUserInfo[]): CallUserInfo[] => [
  ...current,
  ...incoming.filter((p) => !current.some((q) => q.id === p.id))
]

const otherParticipants = (state: CallStateResponse, meId: string): CallUserInfo[] =>
  state.participants
    .filter((p) => p.user_id && p.user_id !== meId)
    .map((p) => ({
      id: p.user_id,
      username: p.username ?? '',
      display_name: p.display_name ?? p.username ?? 'Usuário',
      avatar_url: p.avatar_url ?? null,
      avatar_decoration_url: p.avatar_decoration_url ?? null,
      nameplate_url: p.nameplate_url ?? null,
      name_style: p.name_style
    }))

const serverVoiceStates = (state: CallStateResponse): Record<string, VoiceState> =>
  Object.fromEntries(
    state.participants.map((p) => [
      p.user_id,
      {
        muted: p.muted ?? false,
        deafened: p.deafened ?? false,
        serverMuted: p.server_muted ?? false,
        serverDeafened: p.server_deafened ?? false
      }
    ])
  )

/**
 * O servidor me lista transmitindo, mas não tenho tela local: sobrou de uma
 * sessão anterior (ex.: o app atualizou com a live aberta e voltou sozinho à
 * call dentro da tolerância de queda). Quem decide se estou no ar sou eu.
 */
export function staleOwnLive(state: CallStateResponse, meId: string, sharing: boolean): boolean {
  return !sharing && (state.screen_sharing ?? []).includes(meId)
}

/** Quem transmite segundo o servidor, comigo conforme a tela local. */
function screenSharers(state: CallStateResponse, meId: string, sharing: boolean): string[] {
  const others = (state.screen_sharing ?? []).filter((id) => id !== meId)
  return sharing ? [...others, meId] : others
}

/**
 * Junta o estado da chamada no servidor ao local. `replace` (ao reentrar ou
 * reconectar) faz o servidor valer; senão só soma quem faltava. Na DM a lista
 * de participantes nunca encolhe: o outro lado é a própria chamada.
 */
export function syncCallState(
  state: CallStateResponse,
  meId: string,
  local: LocalCallState,
  replace: boolean
): SyncedCallState {
  const others = otherParticipants(state, meId)
  const joinRequests = (state.join_requests ?? []).map((p) => ({
    id: p.id,
    username: p.username,
    display_name: p.display_name,
    avatar_url: p.avatar_url ?? null,
    avatar_decoration_url: p.avatar_decoration_url ?? null,
    nameplate_url: p.nameplate_url ?? null
  }))
  return {
    locked: state.call?.locked ?? local.locked,
    joinRequests: replace ? joinRequests : addMissing(local.joinRequests, joinRequests),
    screenSharers: screenSharers(state, meId, local.isScreenSharing),
    screenWatchers: state.screen_watchers ?? local.screenWatchers,
    voiceStates: {
      ...serverVoiceStates(state),
      ...(replace ? {} : local.voiceStates)
    },
    participants:
      replace && local.type === 'channel' ? others : addMissing(local.participants, others)
  }
}
