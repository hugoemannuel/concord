// Lê, sob demanda, o getStats() da chamada atual para a telemetria (docs/adr/0070): a voz, a minha transmissão
// ou a de outra pessoa, e as saídas de áudio do aparelho. A chamada (livekitMedia.ts) registra a leitura ao
// conectar e tira ao sair; a telemetria lê daqui sem tocar na mídia. Puro.

export type Stat = Record<string, unknown>

/** O RTCStatsReport do WebRTC (no React Native, um Map de id para a estatística). */
export interface StatsReport {
  get(id: string): unknown
  forEach(callback: (stat: Stat, id: string) => void): void
}

/** Uma leitura da transmissão de tela: o relatório e o estado da publicação no SDK. */
export interface ScreenStatsInput {
  report: StatsReport
  /** Recepção: 'paused' = o servidor parou de mandar (conexão fraca). */
  streamState: string
  /** Envio: fps pedido na publicação (null = o padrão do SDK). */
  requestedFps: number | null
}

export interface CallStatsReader {
  /** null = essa transmissão não está publicada (acabou ou ainda não chegou). */
  readScreen(userId: string, local: boolean): Promise<ScreenStatsInput | null>
  /** A voz: o meu microfone e a de cada pessoa que eu ouço, num relatório só. */
  readCall(): Promise<StatsReport | null>
  /** Saídas de áudio disponíveis ('bluetooth', 'headset', 'speaker', 'earpiece'). */
  readAudioOutputs(): Promise<string[]>
}

let active: CallStatsReader | null = null

export function setActiveCallStats(reader: CallStatsReader): void {
  active = reader
}

export function clearActiveCallStats(reader: CallStatsReader): void {
  if (active === reader) active = null
}

export async function readActiveScreen(userId: string, local: boolean): Promise<ScreenStatsInput | null> {
  return (await active?.readScreen(userId, local)) ?? null
}

export async function readActiveCall(): Promise<StatsReport | null> {
  return (await active?.readCall()) ?? null
}

export async function readActiveAudioOutputs(): Promise<string[]> {
  return (await active?.readAudioOutputs().catch(() => [])) ?? []
}
