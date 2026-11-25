import type { DeviceTake } from '../../../../../../shared/deviceStats'
import { usePresenceActivityStore } from '../../../activity/store/presenceActivityStore'
import { useAuthStore } from '../../../auth/store/authStore'
import { useCallStore } from '../../../call/store/callStore'
import { anonymousGuestLink, useGuestSessionStore } from '../../../guests/store/guestSessionStore'
import { useServerStore } from '../../../servers/store/serverStore'
import { API_BASE_URL, IS_WEB } from '../../../../shared/lib/config'
import { takeWsRtt } from '../../../../shared/lib/perf/wsRtt'
import { postDeviceTelemetry } from '../../api/device/deviceTelemetry'
import { loadClientContext } from '../telemetryContext'
import { observeDevicePerformance } from './deviceObservers'
import { DeviceReporter, ROW_TICK_MS } from './deviceReporter'
import { deviceLabelOf, shouldCollect } from './deviceState'
import { RendererMeter } from './rendererMeter'
import { createSessionSwitch } from './sessionSwitch'
import { markStartup } from './startupMark'
import { watchWindowActivity, windowFocused, windowVisible } from './windowSignal'

// Cola da telemetria do aparelho (docs/adr/0069) com o DOM, os stores (só
// leitura) e o main. Timers: 60 s com login de conta e 2 s só com a janela
// visível (pelo estado da janela do app, windowSignal.ts); o resto são
// observadores e eventos. Nenhum requestAnimationFrame.

function readHeap(): number | null {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
  return memory?.usedJSHeapSize ?? null
}

function currentLabel(): ReturnType<typeof deviceLabelOf> {
  const call = useCallStore.getState()
  const activity = usePresenceActivityStore.getState()
  return deviceLabelOf({
    status: call.status,
    isScreenSharing: call.isScreenSharing,
    watchedScreenIds: call.watchedScreenIds,
    activityEnabled: activity.enabled,
    detectedGame: activity.detected
  })
}

const collecting = (): boolean =>
  shouldCollect(
    useAuthStore.getState().accessToken,
    anonymousGuestLink(useGuestSessionStore.getState())
  )

/** Desktop: a take do main; no web não há (os campos do main ficam null). */
function takeMain(): Promise<DeviceTake | null> {
  return window.api?.deviceStats?.take() ?? Promise.resolve(null)
}

function startCollecting(webStartupMs: () => number | null): () => void {
  const now = (): number => performance.now()
  const meter = new RendererMeter({
    now,
    visible: windowVisible,
    focused: windowFocused,
    apiBaseUrl: API_BASE_URL,
    takeWsRtt
  })
  const reporter = new DeviceReporter({
    now,
    label: currentLabel,
    measures: () => meter.take(readHeap()),
    takeMain,
    context: loadClientContext,
    send: postDeviceTelemetry,
    sessionId: crypto.randomUUID(),
    web: IS_WEB,
    webStartupMs
  })
  meter.start()
  const stopObservers = observeDevicePerformance(meter)
  const stopWindow = watchWindowActivity(() => meter.windowChanged())
  const onLabel = (): void => void reporter.labelChanged()
  const offCall = useCallStore.subscribe(onLabel)
  const offActivity = usePresenceActivityStore.subscribe(onLabel)
  void reporter.arm()
  const timer = setInterval(() => void reporter.tick(), ROW_TICK_MS)
  return () => {
    clearInterval(timer)
    offCall()
    offActivity()
    stopWindow()
    stopObservers()
    meter.stop()
    reporter.stop()
  }
}

/** "Primeira tela usável" = a lista de servidores chegou (como no --perf-log). */
function whenServersLoaded(onLoaded: () => void): void {
  const unsubscribe = useServerStore.subscribe((state) => {
    if (!state.serversLoaded) return
    unsubscribe()
    onLoaded()
  })
}

/**
 * Métricas do aparelho: liga com login de conta (visitante sem conta não
 * manda nada) e desliga no logout. Chamar uma vez, antes do primeiro render.
 */
export function startDeviceTelemetry(): void {
  const startedLoggedIn = useAuthStore.getState().accessToken !== null
  let webStartupMs: number | null = null
  whenServersLoaded(() => {
    const usable = (): void => window.api?.deviceStats?.usable()
    webStartupMs = markStartup({ startedLoggedIn, web: IS_WEB, now: performance.now(), usable })
  })
  const toggle = createSessionSwitch(() => startCollecting(() => webStartupMs))
  const sync = (): void => toggle(collecting())
  useAuthStore.subscribe(sync)
  useGuestSessionStore.subscribe(sync)
  sync()
}
