import { wsConnectUrl } from './wsTicket'
import { isPlannedRestart, isSessionRevoked, reconnectDelay } from '../lib/wsReconnect'
import { HEARTBEAT_EVERY_MS, heartbeatStep, type HeartbeatState } from '../lib/wsHeartbeat'

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
  /**
   * Endereço da conexão, com a credencial (?ticket=, docs/adr/0046). null =
   * sem sessão; rejeição = falha temporária (queda, tenta de novo). Padrão:
   * pede o ticket ao servidor (wsTicket).
   */
  getConnectUrl?: () => Promise<string | null>
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
  /** Pedindo o endereço (ticket): ninguém abre outra tentativa em paralelo. */
  private opening = false
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  /** Batimento da conexão aberta (ver lib/wsHeartbeat). */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private heartbeat: HeartbeatState = { pingSentAt: null, lastMessageAt: 0, pongSeen: false }

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
    this.stopHeartbeat()
    this.subscriptions.clear()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  /** "Tentar agora": pula a espera do backoff (sem efeito se já conectado ou conectando). */
  retryNow(): void {
    if (this.closedByUser || this.busy()) return
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
    if (this.closedByUser || this.opening || this.busy()) return
    this.opening = true
    const getUrl = this.config.getConnectUrl ?? (() => wsConnectUrl(this.config.getToken))
    getUrl().then(
      (url) => {
        this.opening = false
        if (url) this.openSocket(url)
      },
      () => {
        this.opening = false
        if (!this.closedByUser) this.lost(false)
      }
    )
  }

  /** Conectado ou conectando. */
  private busy(): boolean {
    const state = this.ws?.readyState
    return state === WebSocket.OPEN || state === WebSocket.CONNECTING
  }

  private openSocket(url: string): void {
    if (this.closedByUser || this.busy()) return
    const ws = new WebSocket(url)

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
      this.startHeartbeat()
      this.config.onOpen?.(reconnected)
    }

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as WsEvent
        if (this.noteAlive(data)) return
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
      if (isSessionRevoked(event.code)) this.revoked()
      else this.lost(isPlannedRestart(event.code))
    }

    ws.onerror = () => {
      ws.close()
    }

    this.ws = ws
  }

  /** A sessão foi encerrada no servidor: não reconecta; quem cuida é o ouvinte de session:revoked (features/auth). */
  private revoked(): void {
    this.ws = null
    this.stopHeartbeat()
    if (this.closedByUser) return
    this.closedByUser = true
    emitWsEvent({ type: 'session:revoked', payload: null })
  }

  /** A conexão atual caiu (fechou ou parou de responder): agenda a volta e avisa. */
  private lost(planned: boolean): void {
    this.ws = null
    this.stopHeartbeat()
    if (this.closedByUser) return
    if (planned) this.serverRestarting = true
    this.scheduleReconnect()
    this.config.onLost?.({ attempt: this.attempt, planned: this.serverRestarting })
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeat = { pingSentAt: null, lastMessageAt: Date.now(), pongSeen: false }
    this.heartbeatTimer = setInterval(() => this.beat(), HEARTBEAT_EVERY_MS)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /** Mensagem do servidor: a conexão está viva. Devolve true se era só o pong. */
  private noteAlive(data: WsEvent): boolean {
    this.heartbeat.lastMessageAt = Date.now()
    if ((data.type as string) !== 'pong') return false
    this.heartbeat.pongSeen = true
    return true
  }

  private beat(): void {
    const ws = this.ws
    if (!ws) return
    const step = heartbeatStep(this.heartbeat, Date.now())
    if (step === 'ping') {
      this.heartbeat.pingSentAt = Date.now()
      this.sendRaw(JSON.stringify({ type: 'ping', payload: null }))
    } else if (step === 'dead') {
      // Meio aberta: o onclose pode demorar minutos. Larga esta (o fechamento
      // atrasado dela é ignorado) e reconecta já.
      this.lost(false)
      ws.close()
    }
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
