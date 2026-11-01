import { wsConnectUrl } from './wsTicket'
import { isPlannedRestart, reconnectDelay } from '../lib/wsReconnect'

export interface WsEvent<T = unknown> {
  type: string
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
   * aberto antes desde o connect(): eventos da queda podem ter se perdido.
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
 * cliente. As features (chat, kanban) se inscrevem aqui. Devolve o "desligar".
 */
export function onWsEvent(listener: WsListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emitWsEvent(event: WsEvent): void {
  listeners.forEach((listener) => listener(event))
}

// Porte do WsClient do desktop (shared/api/ws.ts), sem a lista fechada de eventos.
export class WsClient {
  private config: WsClientConfig
  private ws: WebSocket | null = null
  private subscriptions = new Set<string>()
  private closedByUser = false
  /** Fechado de propósito com o app em segundo plano: não reconecta sozinho, mas guarda as salas. */
  private suspended = false
  /** Tentativas de reconectar desde a última conexão aberta. */
  private attempt = 0
  /** O servidor avisou que estava reiniciando (1012): reconecta logo. */
  private serverRestarting = false
  /** Já abriu alguma vez desde o connect(). */
  private everOpened = false
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  /** Pedindo o endereço (ticket): ninguém abre outra tentativa em paralelo. */
  private opening = false

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
    this.ws?.close()
    this.ws = null
  }

  /**
   * Fecha a conexão sem reconectar e sem esquecer as salas: com o app em segundo plano o servidor precisa
   * ver a pessoa offline para mandar push. `resume()` volta.
   */
  suspend(): void {
    this.suspended = true
    this.clearRetry()
    const ws = this.ws
    this.ws = null
    ws?.close()
  }

  /** Volta do `suspend()`: reabre na hora e reassina as salas. */
  resume(): void {
    this.suspended = false
    this.retryNow()
  }

  /** "Tentar agora": pula a espera do backoff (sem efeito se já conectado ou conectando). */
  retryNow(): void {
    if (this.closedByUser || this.isActive()) return
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

  private isActive(): boolean {
    const state = this.ws?.readyState
    return state === WebSocket.OPEN || state === WebSocket.CONNECTING
  }

  /** Fechado de propósito (disconnect ou suspend): não abre. */
  private held(): boolean {
    return this.closedByUser || this.suspended
  }

  private open(): void {
    if (this.held() || this.opening || this.isActive()) return
    this.opening = true
    const getUrl = this.config.getConnectUrl ?? (() => wsConnectUrl(this.config.getToken))
    getUrl().then(
      (url) => {
        this.opening = false
        if (url) this.openSocket(url)
      },
      () => {
        this.opening = false
        if (!this.held()) this.lost()
      }
    )
  }

  private openSocket(url: string): void {
    if (this.held() || this.isActive()) return
    const ws = new WebSocket(url)
    ws.onopen = () => this.handleOpen()
    ws.onmessage = (event: MessageEvent) => this.handleMessage(event)
    ws.onclose = (event: CloseEvent) => this.handleClose(ws, event.code)
    ws.onerror = () => ws.close()
    this.ws = ws
  }

  private handleOpen(): void {
    this.attempt = 0
    this.serverRestarting = false
    const userId = this.config.getUserId()
    if (userId) this.subscriptions.add(`user:${userId}`)
    for (const room of this.subscriptions) this.send({ type: 'subscribe', payload: { room } })
    const reconnected = this.everOpened
    this.everOpened = true
    this.config.onOpen?.(reconnected)
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data as string) as WsEvent
      this.config.onEvent(data)
      emitWsEvent(data)
    } catch {
      // quadro malformado: ignora
    }
  }

  private handleClose(ws: WebSocket, code: number): void {
    // Conexão antiga (disconnect() e connect() logo em seguida): a nova já
    // está no lugar; o fechamento atrasado desta não é queda.
    if (this.ws !== ws) return
    this.ws = null
    if (this.closedByUser) return
    if (isPlannedRestart(code)) this.serverRestarting = true
    this.lost()
  }

  /** Caiu (ou não deu para pedir o ticket): agenda a volta e avisa. */
  private lost(): void {
    this.scheduleReconnect()
    this.config.onLost?.({ attempt: this.attempt, planned: this.serverRestarting })
  }

  private send(event: WsEvent): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(event))
  }

  private scheduleReconnect(): void {
    this.clearRetry()
    const delay = reconnectDelay(this.attempt, this.serverRestarting)
    this.attempt++
    this.retryTimer = setTimeout(() => this.open(), delay)
  }

  private clearRetry(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
  }
}
