// Batimento do WebSocket do chat. Troca de rede (Wi-Fi, IP novo) deixa o WS
// meio aberto: sem erro nem onclose, o app acha que está conectado enquanto o
// servidor já o deu como offline (e o tirou das salas). O navegador não expõe
// o ping/pong do protocolo, então o app manda {"type":"ping"} a cada tanto e,
// se nada voltar no prazo, fecha e reconecta. Ver docs/adr/0037.

/** Intervalo entre pings (com a janela em segundo plano o navegador pode espaçar). */
export const HEARTBEAT_EVERY_MS = 25_000
/** Prazo para o servidor responder (o pong ou qualquer outro evento). */
export const PONG_TIMEOUT_MS = 10_000

export interface HeartbeatState {
  /** Quando saiu o último ping; null = nenhum nesta conexão. */
  pingSentAt: number | null
  /** Quando chegou a última mensagem do servidor (qualquer uma). */
  lastMessageAt: number
  /** O servidor já respondeu um pong nesta conexão (servidor antigo não responde). */
  pongSeen: boolean
}

/** O que fazer neste batimento: mandar ping, esperar a resposta ou dar a conexão como morta. */
export function heartbeatStep(state: HeartbeatState, now: number): 'ping' | 'wait' | 'dead' {
  const { pingSentAt, lastMessageAt, pongSeen } = state
  const pending = pingSentAt !== null && lastMessageAt < pingSentAt
  // Servidor sem pong (versão antiga): o silêncio não prova nada.
  if (!pending || !pongSeen) return 'ping'
  return now - pingSentAt >= PONG_TIMEOUT_MS ? 'dead' : 'wait'
}
