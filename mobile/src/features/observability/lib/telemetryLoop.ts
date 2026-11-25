import type { CallPhase } from '../../call/lib/callTypes'

// Ritmo da telemetria no Android (docs/adr/0070): o timer só existe com a call em andamento, para não acordar o
// aparelho fora dela. Ao sair (ou quando a entrada falhou antes de ter id), uma última leitura manda o fim das
// sessões e os eventos pendentes. Puro.

const LIVE: CallPhase[] = ['connecting', 'active', 'reconnecting']

/** Call em andamento, com id (tocando para mim ou esperando atender ainda não). */
export function inCall({ phase, callId }: { phase: CallPhase; callId: string | null }): boolean {
  return LIVE.includes(phase) && !!callId
}

export interface LoopDeps {
  tick(): Promise<void>
  /** Liga os sinais do celular (AppState, NetInfo). */
  start(): void
  stop(): void
  /** Há evento da voz guardado (a entrada falhou antes de a call ter id). */
  pending(): boolean
}

export function createTelemetryLoop(deps: LoopDeps, everyMs: number) {
  let timer: ReturnType<typeof setInterval> | null = null

  function halt(): boolean {
    if (!timer) return false
    clearInterval(timer)
    timer = null
    deps.stop()
    return true
  }

  return {
    sync(live: boolean): void {
      if (live && !timer) {
        deps.start()
        timer = setInterval(() => void deps.tick(), everyMs)
      } else if (!live && (halt() || deps.pending())) {
        void deps.tick()
      }
    },
    dispose(): void {
      halt()
    }
  }
}
