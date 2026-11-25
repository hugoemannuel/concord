import { realtime } from '../../../shared/api/realtime'
import { LIVEKIT_URL } from '../../../shared/lib/config'
import { useAuthStore } from '../../auth/store/authStore'
import { connectionProbe } from '../../observability/lib/callTelemetryState'
import { useVoiceControlsStore } from '../../voice/store/voiceControlsStore'
import { endCallRequest, getCallState, getCallToken, startCall } from '../api/calls'
import { createCallController } from './callController'
import { createLiveKitMedia } from './livekitMedia'
import { ensureCameraPermission } from './cameraPermission'
import { ensureMicPermission } from './micPermission'

/** A chamada do app, com a mídia, a API e o WebSocket reais. Um só objeto: telas e hooks falam com ele. */
export const callController = createCallController({
  // A sonda da telemetria anota em que etapa a entrada falhou e quando a voz caiu (docs/adr/0070).
  api: connectionProbe.api({ startCall, getCallToken, endCallRequest, getCallState }),
  media: connectionProbe.media(createLiveKitMedia()),
  ws: {
    send: (type, payload) => realtime.sendEvent(type, payload),
    subscribe: (room) => realtime.subscribe(room),
    unsubscribe: (room) => realtime.unsubscribe(room)
  },
  liveKitUrl: LIVEKIT_URL,
  controls: () => {
    const { muted, deafened } = useVoiceControlsStore.getState()
    return { muted, deafened }
  },
  ensureMicPermission,
  ensureCameraPermission,
  meId: () => useAuthStore.getState().user?.id ?? null
})
