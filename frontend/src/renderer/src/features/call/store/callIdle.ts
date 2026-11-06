import type { RemoteMedia } from '../lib/livekit'
import { IDLE_CALL_CONNECTION } from '../lib/callConnection'
import type { CallState } from './callStore'

// Estado "fora de chamada", tirado do callStore (god file) para ele encolher.

export const EMPTY_MEDIA: RemoteMedia = {
  streams: {},
  screenStreams: {},
  screenAudioStreams: {},
  videoStreams: {},
  mediaPeers: {},
  availableScreens: []
}

/**
 * Campos do estado inicial que o fim da chamada restaura. Fica de fora o que vale
 * entre chamadas: dispositivos, palco, lista de calls do servidor e batida na porta.
 */
export const IDLE_CALL = {
  status: 'idle',
  callId: null,
  type: null,
  conversationId: null,
  channelId: null,
  serverId: null,
  participants: [],
  isInitiator: false,
  ...EMPTY_MEDIA,
  localScreenStream: null,
  isScreenSharing: false,
  screenShareQuality: null,
  pendingScreenQuality: null,
  localCameraStream: null,
  screenSharers: [],
  screenWatchers: {},
  speakingIds: [],
  voiceStates: {},
  watchedScreenIds: [],
  dmMinimized: false,
  focusedScreenUserId: null,
  muted: false,
  deafened: false,
  canSpeak: true,
  canStream: true,
  mutedBeforeDeafen: false,
  startedAt: null,
  locked: false,
  joinRequests: [],
  connection: IDLE_CALL_CONNECTION,
  connectionQuality: {},
  qualityDetails: {}
} satisfies Partial<CallState>
