import { WS_URL } from '../lib/config'
import { isPlannedRestart, isSessionRevoked, reconnectDelay } from '../lib/wsReconnect'

export type WsEventType =
  | 'message:create'
  | 'message:delete'
  | 'message:poll:update'
  | 'level:update'
  | 'level:up'
  | 'voice:boost'
  | 'badge:unlock'
  | 'proposal:create'
  | 'proposal:update'
  | 'proposal:delete'
  | 'proposal:comment_create'
  | 'proposal:comment_update'
  | 'proposal:comment_delete'
  | 'proposal:mention'
  | 'presence:update'
  | 'presence:activity'
  | 'channel:create'
  | 'channel:update'
  | 'channel:delete'
  | 'channel:reorder'
  | 'server:update'
  | 'server:delete'
  | 'server:member:join'
  | 'server:member:update'
  | 'server:member:leave'
  | 'server:member:roles'
  | 'server:member:nickname'
  | 'server:removed'
  | 'server:permissions:invalidate'
  | 'server:invite_code'
  | 'role:create'
  | 'role:update'
  | 'role:delete'
  | 'role:reorder'
  | 'user:update'
  | 'friend:request'
  | 'friend:request:accepted'
  | 'friend:request:declined'
  | 'friend:request:cancelled'
  | 'friend:removed'
  | 'call:invite_ended'
  | 'typing'
  | 'typing:stop'

export interface WsEvent<T = unknown> {
  type: WsEventType | string
  payload: T
}

interface WsClientConfig {
  getToken: () => string | null
  getUserId: () => string | null
  onEvent: (event: WsEvent) => void
  /**
   * Conexão (re)aberta, depois de reassinar as salas. `reconnected`: já tinha
   * aberto antes desde o connect() — eventos da queda podem ter se perdido.
   */
  onOpen?: (reconnected: boolean) => void
  /**
   * Conexão caiu (ou uma tentativa de reconectar falhou) sem ser por
   * disconnect(). `attempt`: a tentativa agendada agora (1 = a primeira);
   * `planned`: o servidor avisou que estava reiniciando (1012).
   */
  onLost?: (info: { attempt: number; planned: boolean }) => void
}

type WsListener = (event: WsEvent) => void

const listeners = new Set<WsListener>()

/**
 * Ouvinte extra dos eventos do servidor, chamado depois do `onEvent` do
 * cliente (quem já tratou o evento atualizou o estado). Para quem só reage a
 * um evento sem passar pelo despachante do chatStore. Devolve o "desligar".
 */
export function onWsEvent(listener: WsListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emitWsEvent(event: WsEvent): void {
  listeners.forEach((listener) => listener(event))
}

export class WsClient {
  private config: WsClientConfig
  private ws: WebSocket | null = null
  private subscriptions = new Set<string>()
  private closedByUser = false
  /** Tentativas de reconectar desde a última conexão aberta. */
  private attempt = 0
  /** O servidor avisou que estava reiniciando (1012): reconecta logo. */
  private serverRestarting = false
  /** Já abriu alguma vez desde o connect(). */
  private everOpened = false
  private retryTimer: ReturnType<typeof setTimeout> | null = null

  constructor(config: WsClientConfig) {
    this.config = config
  }

  connect(): void {
    this.closedByUser = false
    this.everOpened = false
    this.open()
  }

  disconnect(): void {
    this.closedByUser = true
    this.clearRetry()
    this.subscriptions.clear()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  /** "Tentar agora": pula a espera do backoff (sem efeito se já conectado ou conectando). */
  retryNow(): void {
    if (this.closedByUser) return
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return
    }
    this.clearRetry()
    this.open()
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  subscribe(room: string): void {
    this.subscriptions.add(room)
    this.send({ type: 'subscribe', payload: { room } })
  }

  unsubscribe(room: string): void {
    this.subscriptions.delete(room)
    this.send({ type: 'unsubscribe', payload: { room } })
  }

  sendEvent(type: string, payload: unknown): void {
    this.send({ type, payload })
  }

  private open(): void {
    const token = this.config.getToken()
    if (!token || this.closedByUser) return
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return
    }

    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`)

    ws.onopen = () => {
      this.attempt = 0
      this.serverRestarting = false
      const userId = this.config.getUserId()
      if (userId) this.subscriptions.add(`user:${userId}`)
      for (const room of this.subscriptions) {
        this.send({ type: 'subscribe', payload: { room } })
      }
      const reconnected = this.everOpened
      this.everOpened = true
      this.config.onOpen?.(reconnected)
    }

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as WsEvent
        this.config.onEvent(data)
        emitWsEvent(data)
      } catch {
        // ignore malformed frames
      }
    }

    ws.onclose = (event: CloseEvent) => {
      // Conexão antiga (disconnect() e connect() logo em seguida): a nova já
      // está no lugar; o fechamento atrasado desta não é queda.
      if (this.ws !== ws) return
      this.ws = null
      if (this.closedByUser) return
      if (isSessionRevoked(event.code)) {
        // Quem cuida é o ouvinte de session:revoked (features/auth).
        this.closedByUser = true
        emitWsEvent({ type: 'session:revoked', payload: null })
        return
      }
      if (isPlannedRestart(event.code)) this.serverRestarting = true
      this.scheduleReconnect()
      this.config.onLost?.({ attempt: this.attempt, planned: this.serverRestarting })
    }

    ws.onerror = () => {
      ws.close()
    }

    this.ws = ws
  }

  private send(event: WsEvent): void {
    if (!this.isConnected()) return
    const raw = JSON.stringify(event)
    this.sendRaw(raw)
  }

  private sendRaw(raw: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(raw)
  }

  private scheduleReconnect(): void {
    this.clearRetry()
    const delay = reconnectDelay(this.attempt, this.serverRestarting)
    this.attempt++
    this.retryTimer = setTimeout(() => {
      this.open()
    }, delay)
  }

  private clearRetry(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
  }
}
