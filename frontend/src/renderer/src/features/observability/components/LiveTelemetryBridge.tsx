import { useEffect } from 'react'
import { useCallStore } from '../../call/store/callStore'
import { useScreenAdaptStore } from '../../call/store/screenAdaptStore'
import { readActiveCallStats, readActiveScreenStats } from '../../call/lib/screenStatsSource'
import { anonymousGuestLink, useGuestSessionStore } from '../../guests/store/guestSessionStore'
import { postTelemetry } from '../api/telemetry'
import { loadClientContext } from '../lib/telemetryContext'
import { changeCallId, createConnectionLog } from '../lib/telemetryConnection'
import { takeScreenCodecChoice } from '../../call/lib/screenCodecChoice'
import { takeHevcDecodeFailure } from '../../call/lib/screenHevcFailure'
import { readMicDsp } from '../../call/lib/micDspStats'
import { createSleepLog } from '../lib/sleepLog'
import { mediaSources } from '../lib/telemetryMediaSources'
import {
  createTelemetryReporter,
  stepChanged,
  TELEMETRY_INTERVAL_MS,
  type CallSnapshot
} from '../lib/telemetryReporter'

/** Visitante sem conta não manda (o servidor recusaria o token e derrubaria a visita). */
const isGuest = (): boolean => anonymousGuestLink(useGuestSessionStore.getState()) !== null

function snapshot(): CallSnapshot {
  const call = useCallStore.getState()
  return {
    callId: call.status === 'active' && !isGuest() ? call.callId : null,
    sharing: call.isScreenSharing,
    watching: call.watchedScreenIds
  }
}

/**
 * Telemetria das lives e calls (docs/adr/0029 e 0032): a cada 20 s, com uma
 * call ativa, manda ao servidor o resumo técnico de cada sessão, com a conexão
 * da voz (fases do callStore, só lidas) e por que a live saiu nesse codec.
 * Fora de call não lê nem manda nada.
 */
function LiveTelemetryBridge(): null {
  useEffect(() => {
    const connection = createConnectionLog()
    const sleeps = createSleepLog(Date.now, () => snapshot().callId !== null)
    const offSleep = window.api?.deviceStats?.onSlept?.(sleeps.note)
    const reporter = createTelemetryReporter({
      snapshot,
      readScreen: readActiveScreenStats,
      readCall: readActiveCallStats,
      context: loadClientContext,
      send: postTelemetry,
      newId: () => crypto.randomUUID(),
      connection,
      codecChoice: takeScreenCodecChoice,
      decodeFailure: takeHevcDecodeFailure,
      micDsp: () => readMicDsp(),
      media: mediaSources(sleeps.take)
    })
    const timer = setInterval(() => void reporter.tick(), TELEMETRY_INTERVAL_MS)
    const offAdapt = useScreenAdaptStore.subscribe((state, previous) => {
      if (stepChanged(previous.view, state.view)) reporter.noteStepChange()
    })
    const offConnection = useCallStore.subscribe((state, previous) => {
      if (state.connection === previous.connection || isGuest()) return
      // Cada mudança fica marcada com a call em que aconteceu.
      const callId = changeCallId(state.callId, previous.callId)
      connection.observe(previous.connection, state.connection, callId)
    })
    return () => {
      clearInterval(timer)
      offAdapt()
      offConnection()
      offSleep?.()
    }
  }, [])
  return null
}

export default LiveTelemetryBridge
