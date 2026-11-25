// Observadores de desempenho da telemetria do aparelho: não acordam a CPU (o
// navegador entrega as entradas junto com o trabalho que já faria).

/** Event Timing: o navegador só entrega eventos a partir daqui (mínimo é 16). */
const EVENT_THRESHOLD_MS = 104

export interface MeterSink {
  longFrame(durationMs: number): void
  interaction(interactionId: number, durationMs: number): void
  resource(entry: { name: string; duration: number; initiatorType: string }): void
}

/** Long Animation Frames onde houver; senão a longtask (mais antiga). */
export function longFrameType(supported: readonly string[]): string | null {
  if (supported.includes('long-animation-frame')) return 'long-animation-frame'
  return supported.includes('longtask') ? 'longtask' : null
}

function observe<T>(init: Record<string, unknown>, onEntry: (entry: T) => void): () => void {
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) onEntry(entry as T)
  })
  observer.observe(init as PerformanceObserverInit)
  return () => observer.disconnect()
}

type EventEntry = PerformanceEntry & { interactionId?: number }

export function observeDevicePerformance(meter: MeterSink): () => void {
  if (typeof PerformanceObserver === 'undefined') return () => {}
  const supported = PerformanceObserver.supportedEntryTypes ?? []
  const stops: (() => void)[] = []
  const frames = longFrameType(supported)
  if (frames)
    stops.push(observe<PerformanceEntry>({ type: frames }, (e) => meter.longFrame(e.duration)))
  if (supported.includes('event')) {
    const init = { type: 'event', durationThreshold: EVENT_THRESHOLD_MS }
    stops.push(
      observe<EventEntry>(init, (e) => meter.interaction(e.interactionId ?? 0, e.duration))
    )
  }
  if (supported.includes('resource')) {
    stops.push(observe<PerformanceResourceTiming>({ type: 'resource' }, (e) => meter.resource(e)))
  }
  return () => stops.forEach((stop) => stop())
}
