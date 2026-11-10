import type { NameStyle } from '../../profile/lib/nameStyle'

export type CallStatus = 'idle' | 'outgoing' | 'active'
export type CallKind = 'dm' | 'channel'

export interface CallUserInfo {
  id: string
  username: string
  display_name: string
  avatar_url?: string | null
  avatar_decoration_url?: string | null
  nameplate_url?: string | null
  /** null = apelido de servidor em uso (sem estilo). */
  name_style?: NameStyle | null
}

export interface VoiceState {
  muted: boolean
  deafened: boolean
  serverMuted?: boolean
  serverDeafened?: boolean
}

/** Meu pedido para entrar numa sala trancada. */
export interface KnockState {
  channelId: string
  callId: string
  status: 'pending' | 'declined'
}

/** POST /calls respondeu 423: a sala do canal está trancada. */
export class CallLockedError extends Error {
  callId: string | null

  constructor(callId: string | null) {
    super('A sala está trancada.')
    this.callId = callId
  }
}
