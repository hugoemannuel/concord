import { joinedOtherUser, type CallView } from './entranceSound'

/** O que o selo "Chegou" lê e escreve (injetado: os testes não sobem os stores). */
export interface ArrivalEventDeps {
  call: () => CallView & { channelId: string | null }
  meId: () => string | undefined
  join: (channelId: string, userId: string, meId: string | undefined) => void
  leave: (channelId: string, userId: string) => void
}

type ArrivalEvent = { type: string; payload: unknown }

/**
 * call:joined / call:left da minha call de canal: marca a chegada (o mesmo
 * evento do som de entrada) e a saída (para a volta rápida não contar). Os
 * call:channel_* da lista do servidor fazem o mesmo nos outros canais.
 */
export function handleArrivalEvent(event: ArrivalEvent, deps: ArrivalEventDeps): void {
  if (event.type.startsWith('call:channel_')) return handleChannelListEvent(event, deps)
  const call = deps.call()
  if (!call.channelId) return
  if (event.type === 'call:joined') {
    const user = joinedOtherUser(event, call, deps.meId())
    if (user) deps.join(call.channelId, user.id, deps.meId())
    return
  }
  if (event.type !== 'call:left') return
  const p = event.payload as { call_id?: string; user?: { id?: string } } | null
  if (p?.call_id === call.callId && p.user?.id) deps.leave(call.channelId, p.user.id)
}

/** Entrada/saída em qualquer canal de voz dos servidores abertos (lib/voiceList). */
function handleChannelListEvent(event: ArrivalEvent, deps: ArrivalEventDeps): void {
  if (event.type === 'call:channel_joined') {
    const p = event.payload as { call?: { channel_id?: string }; participant?: { user_id?: string } }
    const channelId = p?.call?.channel_id
    const userId = p?.participant?.user_id
    if (channelId && userId) deps.join(channelId, userId, deps.meId())
    return
  }
  if (event.type !== 'call:channel_left') return
  const p = event.payload as { channel_id?: string; user_id?: string } | null
  if (p?.channel_id && p.user_id) deps.leave(p.channel_id, p.user_id)
}
