/** `replaced`: a mesma conta entrou na chamada em outro aparelho e o LiveKit tirou este (DUPLICATE_IDENTITY). */
export type MediaConnection = 'connected' | 'reconnecting' | 'disconnected' | 'replaced'

/**
 * A mídia da chamada (LiveKit). Porta: só `livekitMedia.ts` fala com o SDK; o resto do app e os testes usam esta
 * interface (ADR 0023).
 */
export interface CallMedia {
  connect(url: string, token: string): Promise<void>
  disconnect(): Promise<void>
  /** Liga ou desliga o microfone; rejeita se o sistema negou a permissão. */
  setMicEnabled(on: boolean): Promise<void>
  /** Liga ou desliga o áudio que chega (fone). */
  setListening(on: boolean): void
  /** Volume (0 a 1) de uma pessoa, só para mim; o fone desligado continua silenciando todo mundo. */
  setUserVolume(userId: string, volume: number): void
  /** Liga ou desliga a transmissão da minha tela (o sistema pede a permissão de captura); rejeita se ela for negada. */
  setScreenShareEnabled(on: boolean): Promise<void>
  /** Liga ou desliga a minha câmera; rejeita se o sistema negou ou a câmera está ocupada. */
  setCameraEnabled(on: boolean): Promise<void>
  /** Troca entre a câmera da frente e a de trás. */
  flipCamera(): Promise<void>
  /** Quem está com a câmera ligada agora (ids das pessoas, eu inclusive). */
  onCameras(listener: (userIds: string[]) => void): () => void
  /** Quem está transmitindo a tela agora (ids das pessoas, eu inclusive). */
  onScreens(listener: (userIds: string[]) => void): () => void
  /** Começa ou para de receber a transmissão de alguém (só o que se assiste consome rede). */
  watchScreen(userId: string, on: boolean): void
  /** Quem está na sala de mídia agora: identidade -> nome (o Maestro só aparece aqui). */
  onPeers(listener: (peers: Record<string, string>) => void): () => void
  onSpeakers(listener: (userIds: string[]) => void): () => void
  /** `expected`: o servidor tirou da sala ou ela acabou (não é queda de rede; a telemetria não conta). */
  onConnection(listener: (state: MediaConnection, info?: { expected: boolean }) => void): () => void
}
