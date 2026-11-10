import type { WsEvent } from '../../../shared/api/ws'
import { useCallNoticeStore } from '../store/callNoticeStore'
import { useCallSessionStore } from '../store/callSessionStore'
import { useIncomingCallStore } from '../store/incomingCallStore'
import { useParticipantsStore } from '../store/participantsStore'
import { playSound } from './sounds/soundPlayer'
import type { InvitePayload, MovedPayload, UserPayload, VoicePayload } from './callTypes'

type Handler = (payload: never, meId: string | null) => void

const session = () => useCallSessionStore.getState()
const people = () => useParticipantsStore.getState()
const notice = (message: string): void => useCallNoticeStore.getState().show(message)
const isMine = (callId: string): boolean => session().callId === callId

/** Volta tudo a ocioso: a mídia desconecta sozinha ao ver a fase `idle` (useCallLifecycle). */
function endCall(): void {
  session().reset()
  people().reset()
}

/** Toca mesmo comigo em outra call (estilo Discord): atender troca de call. */
function onInvite(p: InvitePayload): void {
  if (p.type !== 'dm') return
  useIncomingCallStore.getState().ring({ callId: p.call_id, conversationId: p.conversation_id ?? null, initiator: p.initiator })
}

function onRing(p: { call_id: string; callee: UserPayload['user'] }): void {
  if (isMine(p.call_id)) people().upsert(p.callee)
}

function onAccept(p: UserPayload): void {
  if (!isMine(p.call_id)) return
  people().upsert(p.user)
  if (session().phase === 'outgoing') session().setPhase('connecting')
}

function onDecline(p: UserPayload): void {
  if (!isMine(p.call_id)) return
  notice(`${p.user.display_name} recusou a chamada.`)
  endCall()
}

function onJoined(p: UserPayload, meId: string | null): void {
  if (!isMine(p.call_id) || p.user.id === meId) return
  if (session().kind !== 'channel') return
  people().upsert(p.user)
  playSound('userJoin')
}

function onLeft(p: UserPayload, meId: string | null): void {
  if (!isMine(p.call_id) || p.user.id === meId) return
  if (session().kind === 'channel') {
    people().remove(p.user.id)
    playSound('userLeave')
    return
  }
  notice(`${p.user.display_name} saiu da chamada.`)
  endCall()
}

function onVoice(p: VoicePayload): void {
  if (!isMine(p.call_id)) return
  people().setVoice(p.user_id, {
    muted: p.muted,
    deafened: p.deafened,
    serverMuted: Boolean(p.server_muted),
    serverDeafened: Boolean(p.server_deafened)
  })
}

function onEnded(p: { call_id: string }): void {
  const incoming = useIncomingCallStore.getState()
  if (incoming.call?.callId === p.call_id) incoming.clear()
  if (!isMine(p.call_id)) return
  notice('A chamada terminou.')
  endCall()
}

function onBusy(): void {
  notice('Essa pessoa já está em outra chamada.')
  endCall()
}

function onError(p: { message?: string }): void {
  if (p.message) notice(p.message)
}

function onMoved(p: MovedPayload, meId: string | null): void {
  if (p.user.id !== meId || !isMine(p.from_call_id)) return
  session().setMovedTo({ channelId: p.channel_id, name: p.channel_name })
}

const HANDLERS: Record<string, Handler> = {
  'call:invite': onInvite as Handler,
  'call:ring': onRing as Handler,
  'call:accept': onAccept as Handler,
  'call:decline': onDecline as Handler,
  'call:joined': onJoined as Handler,
  'call:left': onLeft as Handler,
  'call:voice': onVoice as Handler,
  'call:ended': onEnded as Handler,
  'call:busy': onBusy as Handler,
  'call:error': onError as Handler,
  'call:moved': onMoved as Handler
}

/** Aplica um evento WS `call:*` às stores. Eventos de outra chamada ou desconhecidos são ignorados. */
export function handleCallEvent(event: WsEvent, meId: string | null): void {
  HANDLERS[event.type]?.(event.payload as never, meId)
}
