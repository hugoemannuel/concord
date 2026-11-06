// Eventos da lista dos canais de voz (sala do servidor): entrar, sair e o fim
// de uma chamada de canal atualizam `serverCalls` na hora, sem polling.
import {
  applyChannelEnded,
  applyChannelJoined,
  applyChannelLeft,
  type ChannelEndedPayload,
  type ChannelJoinedPayload,
  type ChannelLeftPayload,
  type ServerCalls
} from '../lib/voiceList'

export interface VoiceListEventDeps {
  update: (apply: (serverCalls: ServerCalls) => ServerCalls) => void
}

type Payload = Record<string, unknown>

export function createVoiceListEventHandlers(
  deps: VoiceListEventDeps
): Record<string, (payload: Payload) => void> {
  return {
    'call:channel_joined': (payload) =>
      deps.update((map) => applyChannelJoined(map, payload as unknown as ChannelJoinedPayload)),
    'call:channel_left': (payload) =>
      deps.update((map) => applyChannelLeft(map, payload as unknown as ChannelLeftPayload)),
    'call:channel_ended': (payload) =>
      deps.update((map) => applyChannelEnded(map, payload as unknown as ChannelEndedPayload))
  }
}
