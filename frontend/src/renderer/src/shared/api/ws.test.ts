import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WsClient, onWsEvent } from './ws'
import { HEARTBEAT_EVERY_MS } from '../lib/wsHeartbeat'

/** WebSocket de mentira: o teste abre e fecha à mão. */
class FakeSocket {
  static CONNECTING = 0
  static OPEN = 1
  static instances: FakeSocket[] = []
  readyState = FakeSocket.CONNECTING
  onopen: (() => void) | null = null
  onclose: ((ev: { code: number }) => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  sent: string[] = []
  constructor(public url: string) {
    FakeSocket.instances.push(this)
  }
  send(raw: string): void {
    this.sent.push(raw)
  }
  close(): void {
    this.readyState = 3
  }
  open(): void {
    this.readyState = FakeSocket.OPEN
    this.onopen?.()
  }
  drop(code: number): void {
    this.readyState = 3
    this.onclose?.({ code })
  }
}

const latest = (): FakeSocket => FakeSocket.instances[FakeSocket.instances.length - 1]

describe('WsClient — reconexão', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeSocket.instances = []
    vi.stubGlobal('WebSocket', FakeSocket)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const client = (): {
    ws: WsClient
    onOpen: ReturnType<typeof vi.fn>
    onLost: ReturnType<typeof vi.fn>
  } => {
    const onOpen = vi.fn()
    const onLost = vi.fn()
    const ws = new WsClient({
      getToken: () => 'tok',
      getUserId: () => 'eu',
      onEvent: () => {},
      onOpen,
      onLost
    })
    return { ws, onOpen, onLost }
  }

  it('sessão encerrada (4001): não reconecta, não avisa queda e avisa os ouvintes', () => {
    const { ws, onLost } = client()
    const seen: string[] = []
    const off = onWsEvent((e) => seen.push(e.type))
    ws.connect()
    latest().open()

    latest().drop(4001)
    vi.advanceTimersByTime(60_000)
    off()

    expect(FakeSocket.instances).toHaveLength(1)
    expect(onLost).not.toHaveBeenCalled()
    expect(seen).toEqual(['session:revoked'])
  })

  it('servidor reiniciando (1012): reconecta em até 300 ms', () => {
    const { ws, onLost } = client()
    ws.connect()
    latest().open()

    latest().drop(1012)
    expect(onLost).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(300)

    expect(FakeSocket.instances).toHaveLength(2)
  })

  it('queda comum: espera o backoff normal de 1 s', () => {
    const { ws } = client()
    ws.connect()
    latest().open()

    latest().drop(1006)
    vi.advanceTimersByTime(999)
    expect(FakeSocket.instances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(FakeSocket.instances).toHaveLength(2)
  })

  it('avisa se é reconexão (para buscar o que se perdeu) e reassina as salas', () => {
    const { ws, onOpen } = client()
    ws.connect()
    latest().open()
    ws.subscribe('channel:1')
    expect(onOpen).toHaveBeenLastCalledWith(false)

    latest().drop(1012)
    vi.advanceTimersByTime(300)
    latest().open()

    expect(onOpen).toHaveBeenLastCalledWith(true)
    expect(latest().sent.map((raw) => JSON.parse(raw).payload.room)).toEqual(
      expect.arrayContaining(['user:eu', 'channel:1'])
    )
  })

  it('disconnect() não reconecta nem avisa queda', () => {
    const { ws, onLost } = client()
    ws.connect()
    latest().open()

    ws.disconnect()
    latest().drop(1000)
    vi.advanceTimersByTime(60_000)

    expect(onLost).not.toHaveBeenCalled()
    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('avisa a queda com o número da tentativa e se é reinício planejado', () => {
    const { ws, onLost } = client()
    ws.connect()
    latest().open()

    latest().drop(1006)
    expect(onLost).toHaveBeenLastCalledWith({ attempt: 1, planned: false })
    vi.advanceTimersByTime(1000)
    latest().drop(1006)
    expect(onLost).toHaveBeenLastCalledWith({ attempt: 2, planned: false })
  })

  it('1012: as tentativas que falham no meio do reinício seguem como planejadas', () => {
    const { ws, onLost } = client()
    ws.connect()
    latest().open()

    latest().drop(1012)
    expect(onLost).toHaveBeenLastCalledWith({ attempt: 1, planned: true })
    vi.advanceTimersByTime(300)
    latest().drop(1006)
    expect(onLost).toHaveBeenLastCalledWith({ attempt: 2, planned: true })
  })

  it('retryNow() tenta na hora, sem esperar o backoff', () => {
    const { ws } = client()
    ws.connect()
    latest().open()
    latest().drop(1006)
    vi.advanceTimersByTime(1000)
    latest().drop(1006) // agora a espera seria de 2 s

    ws.retryNow()
    expect(FakeSocket.instances).toHaveLength(3)
    // O timer antigo foi cancelado: não abre uma conexão a mais.
    vi.advanceTimersByTime(2000)
    expect(FakeSocket.instances).toHaveLength(3)
  })

  it('retryNow() não abre outra conexão se já está conectando ou conectado', () => {
    const { ws } = client()
    ws.connect()
    ws.retryNow()
    expect(FakeSocket.instances).toHaveLength(1)
    latest().open()
    ws.retryNow()
    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('retryNow() depois de disconnect() não faz nada', () => {
    const { ws } = client()
    ws.connect()
    latest().open()
    ws.disconnect()
    ws.retryNow()
    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('fechamento atrasado da conexão antiga (disconnect + connect) não conta como queda', () => {
    const { ws, onLost } = client()
    ws.connect()
    const old = latest()
    old.open()
    ws.disconnect()
    ws.connect()
    latest().open()

    old.drop(1000)
    vi.advanceTimersByTime(60_000)
    expect(onLost).not.toHaveBeenCalled()
    expect(FakeSocket.instances).toHaveLength(2)
  })
})

// Regressão (31/10/2026): a rede trocou de IP no meio da call e o WS ficou
// meio aberto. Sem erro nem onclose, o app seguiu achando que estava conectado
// por mais de 10 min: não reconectou, a presença ficou offline e a call não
// foi ressincronizada.
describe('WsClient — batimento (ping/pong)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeSocket.instances = []
    vi.stubGlobal('WebSocket', FakeSocket)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const pings = (socket: FakeSocket): number =>
    socket.sent.filter((raw) => JSON.parse(raw).type === 'ping').length
  const pong = (socket: FakeSocket): void =>
    socket.onmessage?.({ data: JSON.stringify({ type: 'pong', payload: null }) })

  const connected = (): {
    ws: WsClient
    onLost: ReturnType<typeof vi.fn>
    onEvent: ReturnType<typeof vi.fn>
    socket: FakeSocket
  } => {
    const onLost = vi.fn()
    const onEvent = vi.fn()
    const ws = new WsClient({ getToken: () => 'tok', getUserId: () => 'eu', onEvent, onLost })
    ws.connect()
    latest().open()
    return { ws, onLost, onEvent, socket: latest() }
  }

  it('manda ping a cada batimento e segue conectado enquanto o pong volta', () => {
    const { onLost, socket } = connected()
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(HEARTBEAT_EVERY_MS)
      pong(socket)
    }
    expect(pings(socket)).toBe(10)
    expect(onLost).not.toHaveBeenCalled()
    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('conexão meio aberta (o pong parou de vir): conta como queda e reconecta', () => {
    const { onLost, socket } = connected()
    vi.advanceTimersByTime(HEARTBEAT_EVERY_MS)
    pong(socket) // o servidor responde: sabe o que é ping

    vi.advanceTimersByTime(HEARTBEAT_EVERY_MS) // ping sem resposta
    expect(onLost).not.toHaveBeenCalled()
    vi.advanceTimersByTime(HEARTBEAT_EVERY_MS) // passou do prazo

    expect(onLost).toHaveBeenCalledWith({ attempt: 1, planned: false })
    vi.advanceTimersByTime(1000)
    expect(FakeSocket.instances).toHaveLength(2)
    // A conexão morta não manda mais nada nem derruba a nova ao fechar atrasada.
    socket.drop(1006)
    expect(onLost).toHaveBeenCalledTimes(1)
  })

  it('servidor antigo (não responde pong): nunca derruba a conexão', () => {
    const { onLost } = connected()
    vi.advanceTimersByTime(HEARTBEAT_EVERY_MS * 20)
    expect(onLost).not.toHaveBeenCalled()
    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('qualquer evento do servidor conta como sinal de vida', () => {
    const { onLost, socket } = connected()
    vi.advanceTimersByTime(HEARTBEAT_EVERY_MS)
    pong(socket)
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(HEARTBEAT_EVERY_MS)
      socket.onmessage?.({ data: JSON.stringify({ type: 'presence:update', payload: {} }) })
    }
    expect(onLost).not.toHaveBeenCalled()
  })

  it('o pong não chega ao onEvent (não é evento do app)', () => {
    const { onEvent, socket } = connected()
    pong(socket)
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('disconnect() para o batimento', () => {
    const { ws, socket } = connected()
    ws.disconnect()
    vi.advanceTimersByTime(HEARTBEAT_EVERY_MS * 3)
    expect(pings(socket)).toBe(0)
  })
})

describe('onWsEvent — ouvintes extras', () => {
  beforeEach(() => {
    FakeSocket.instances = []
    vi.stubGlobal('WebSocket', FakeSocket)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('recebe cada evento depois do onEvent do cliente, até desligar', () => {
    const order: string[] = []
    const ws = new WsClient({
      getToken: () => 'tok',
      getUserId: () => 'eu',
      onEvent: (e) => order.push(`cliente:${e.type}`)
    })
    const off = onWsEvent((e) => order.push(`ouvinte:${e.type}`))
    ws.connect()
    latest().open()

    latest().onmessage?.({ data: JSON.stringify({ type: 'call:joined', payload: {} }) })
    off()
    latest().onmessage?.({ data: JSON.stringify({ type: 'call:left', payload: {} }) })

    expect(order).toEqual(['cliente:call:joined', 'ouvinte:call:joined', 'cliente:call:left'])
  })
})
