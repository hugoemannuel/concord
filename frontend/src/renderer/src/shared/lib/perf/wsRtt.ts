import { percentile } from './percentile'

// Ida e volta do batimento do WebSocket do chat (ping → pong, docs/adr/0037),
// anotada pelo WsClient. A telemetria do aparelho (docs/adr/0069) leva a
// mediana e o máximo desde a última vez. Um ping a cada 25 s: poucas medidas.

const MAX_SAMPLES = 200

let samples: number[] = []

/** Chegou o pong: `pingSentAt` é quando saiu o último ping (null = nenhum nesta conexão). */
export function noteWsPong(pingSentAt: number | null, now: number): void {
  if (pingSentAt === null || now < pingSentAt) return
  samples.push(now - pingSentAt)
  if (samples.length > MAX_SAMPLES) samples.shift()
}

export function takeWsRtt(): { medianMs: number | null; maxMs: number | null } {
  const taken = samples
  samples = []
  return { medianMs: percentile(taken, 50), maxMs: taken.length > 0 ? Math.max(...taken) : null }
}
