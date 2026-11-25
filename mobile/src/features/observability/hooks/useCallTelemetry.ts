import NetInfo from '@react-native-community/netinfo'
import { useEffect } from 'react'
import { AppState } from 'react-native'
import { readActiveAudioOutputs, readActiveCall, readActiveScreen } from '../../call/lib/callStatsSource'
import { useCallSessionStore } from '../../call/store/callSessionStore'
import { useScreenShareStore } from '../../call/store/screenShareStore'
import { postTelemetry } from '../api/telemetry'
import { callEventLog } from '../lib/callTelemetryState'
import { createDeviceSignals, networkLabel, type DeviceSignals } from '../lib/deviceSignals'
import { newSessionId } from '../lib/sessionId'
import { createConnectionObserver } from '../lib/telemetryConnection'
import { loadClientContext } from '../lib/telemetryContext'
import { createTelemetryLoop, inCall } from '../lib/telemetryLoop'
import { createTelemetryReporter, TELEMETRY_INTERVAL_MS, type CallSnapshot } from '../lib/telemetryReporter'

function snapshot(): CallSnapshot {
  const session = useCallSessionStore.getState()
  const screens = useScreenShareStore.getState()
  return {
    callId: inCall(session) ? session.callId : null,
    sharing: screens.sharing,
    watching: screens.watching ? [screens.watching] : []
  }
}

/** Ouve sair/voltar do app e a troca de rede (o NetInfo já entrega a rede de agora ao assinar). */
function watchDevice(signals: DeviceSignals): () => void {
  const app = AppState.addEventListener('change', (state) => signals.appState(state))
  const offNetwork = NetInfo.addEventListener((state) => signals.network(networkLabel(state)))
  return () => {
    app.remove()
    offNetwork()
  }
}

/**
 * Telemetria das calls e lives no Android (docs/adr/0070): com uma call em andamento, a cada 20 s manda ao
 * servidor o resumo técnico de cada sessão, com a conexão (fases da chamada, só lidas) e os sinais do celular.
 * Fora de call não lê, não ouve e não manda nada.
 */
export function useCallTelemetry(): void {
  useEffect(() => {
    const connection = createConnectionObserver(callEventLog)
    const signals = createDeviceSignals(callEventLog)
    const reporter = createTelemetryReporter({
      snapshot,
      readScreen: readActiveScreen,
      readCall: readActiveCall,
      context: async () => loadClientContext(signals.currentNetwork()),
      send: postTelemetry,
      newId: () => newSessionId(),
      callExtras: async () => {
        signals.route(await readActiveAudioOutputs())
        return { connectMs: connection.takeConnectMs(), events: callEventLog.take() }
      }
    })
    let unwatch = (): void => {}
    const loop = createTelemetryLoop(
      {
        tick: reporter.tick,
        start: () => {
          signals.reset()
          unwatch = watchDevice(signals)
        },
        stop: () => unwatch()
      },
      TELEMETRY_INTERVAL_MS
    )
    loop.sync(inCall(useCallSessionStore.getState()))
    const off = useCallSessionStore.subscribe((state, prev) => {
      connection.observe(prev.phase, state.phase)
      loop.sync(inCall(state))
    })
    return () => {
      off()
      loop.dispose()
    }
  }, [])
}
