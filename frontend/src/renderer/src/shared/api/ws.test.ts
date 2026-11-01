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

/** O endereço (ticket) chega numa promessa: deixa ela resolver. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

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
      getConnectUrl: async () => 'ws://srv/ws?ticket=t',
      getUserId: () => 'eu',
      onEvent: () => {},
      onOpen,
      onLost
    })
    return { ws, onOpen, onLost }
  }

  it('sessão encerrada (4001): não reconecta, não avisa queda e avisa os ouvintes', async () => {
    const { ws, onLost } = client()
    const seen: string[] = []
    const off = onWsEvent((e) => seen.push(e.type))
    ws.connect()
    await settle()
    latest().open()

    latest().drop(4001)
    await vi.advanceTimersByTimeAsync(60_000)
    off()

    expect(FakeSocket.instances).toHaveLength(1)
    expect(onLost).not.toHaveBeenCalled()
    expect(seen).toEqual(['session:revoked'])
  })

  it('servidor reiniciando (1012): reconecta em até 300 ms', async () => {
    const { ws, onLost } = client()
    ws.connect()
    await settle()
    latest().open()

    latest().drop(1012)
    expect(onLost).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(300)

    expect(FakeSocket.instances).toHaveLength(2)
  })

  it('queda comum: espera o backoff normal de 1 s', async () => {
    const { ws } = client()
    ws.connect()
    await settle()
    latest().open()

    latest().drop(1006)
    await vi.advanceTimersByTimeAsync(999)
    expect(FakeSocket.instances).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(FakeSocket.instances).toHaveLength(2)
  })

  it('avisa se é reconexão (para buscar o que se perdeu) e reassina as salas', async () => {
    const { ws, onOpen } = client()
    ws.connect()
    await settle()
    latest().open()
    ws.subscribe('channel:1')
    expect(onOpen).toHaveBeenLastCalledWith(false)

    latest().drop(1012)
    await vi.advanceTimersByTimeAsync(300)
    latest().open()

    expect(onOpen).toHaveBeenLastCalledWith(true)
    expect(latest().sent.map((raw) => JSON.parse(raw).payload.room)).toEqual(
      expect.arrayContaining(['user:eu', 'channel:1'])
    )
  })

  it('disconnect() não reconecta nem avisa queda', async () => {
    const { ws, onLost } = client()
    ws.connect()
    await settle()
    latest().open()

    ws.disconnect()
    latest().drop(1000)
    await vi.advanceTimersByTimeAsync(60_000)

    expect(onLost).not.toHaveBeenCalled()
    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('avisa a queda com o número da tentativa e se é reinício planejado', async () => {
    const { ws, onLost } = client()
    ws.connect()
    await settle()
    latest().open()

    latest().drop(1006)
    expect(onLost).toHaveBeenLastCalledWith({ attempt: 1, planned: false })
    await vi.advanceTimersByTimeAsync(1000)
    latest().drop(1006)
    expect(onLost).toHaveBeenLastCalledWith({ attempt: 2, planned: false })
  })

  it('1012: as tentativas que falham no meio do reinício seguem como planejadas', async () => {
    const { ws, onLost } = client()
    ws.connect()
    await settle()
    latest().open()

    latest().drop(1012)
    expect(onLost).toHaveBeenLastCalledWith({ attempt: 1, planned: true })
    await vi.advanceTimersByTimeAsync(300)
    latest().drop(1006)
    expect(onLost).toHaveBeenLastCalledWith({ attempt: 2, planned: true })
  })

  it('retryNow() tenta na hora, sem esperar o backoff', async () => {
    const { ws } = client()
    ws.connect()
    await settle()
    latest().open()
    latest().drop(1006)
    await vi.advanceTimersByTimeAsync(1000)
    latest().drop(1006) // agora a espera seria de 2 s

    ws.retryNow()

    await settle()
    expect(FakeSocket.instances).toHaveLength(3)
    // O timer antigo foi cancelado: não abre uma conexão a mais.
    await vi.advanceTimersByTimeAsync(2000)
    expect(FakeSocket.instances).toHaveLength(3)
  })

  it('retryNow() não abre outra conexão se já está conectando ou conectado', async () => {
    const { ws } = client()
    ws.connect()
    await settle()
    ws.retryNow()
    await settle()
    expect(FakeSocket.instances).toHaveLength(1)
    latest().open()
    ws.retryNow()
    await settle()
    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('retryNow() depois de disconnect() não faz nada', async () => {
    const { ws } = client()
    ws.connect()
    await settle()
    latest().open()
    ws.disconnect()
    ws.retryNow()
    await settle()
    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('fechamento atrasado da conexão antiga (disconnect + connect) não conta como queda', async () => {
    const { ws, onLost } = client()
    ws.connect()
    await settle()
    const old = latest()
    old.open()
    ws.disconnect()
    ws.connect()
    await settle()
    latest().open()

    old.drop(1000)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(onLost).not.toHaveBeenCalled()
    expect(FakeSocket.instances).toHaveLength(2)
  })
})

// Ticket do WebSocket (docs/adr/0046): o endereço vem de uma promessa (o
// ticket é pedido ao servidor a cada conexão) e o token não vai na URL.
describe('WsClient — endereço com ticket', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeSocket.instances = []
    vi.stubGlobal('WebSocket', FakeSocket)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const make = (getConnectUrl: () => Promise<string | null>) => {
    const onLost = vi.fn()
    const ws = new WsClient({ getToken: () => 'tok', getConnectUrl, getUserId: () => 'eu', onEvent: () => {}, onLost })
    return { ws, onLost }
  }

  it('conecta no endereço com o ticket, pedindo um novo a cada tentativa', async () => {
    let n = 0
    const { ws } = make(async () => `ws://srv/ws?ticket=t${++n}`)
    ws.connect()
    await settle()
    expect(latest().url).toBe('ws://srv/ws?ticket=t1')
    latest().open()
    latest().drop(1006)
    await vi.advanceTimersByTimeAsync(1000)
    expect(latest().url).toBe('ws://srv/ws?ticket=t2')
  })

  it('pedir o ticket falhou (rede, 503): conta como queda e tenta de novo com espera', async () => {
    const getUrl = vi.fn().mockRejectedValueOnce(new Error('rede')).mockResolvedValue('ws://srv/ws?ticket=ok')
    const { ws, onLost } = make(getUrl)
    ws.connect()
    await settle()
    expect(FakeSocket.instances).toHaveLength(0)
    expect(onLost).toHaveBeenCalledWith({ attempt: 1, planned: false })
    await vi.advanceTimersByTimeAsync(1000)
    expect(latest().url).toBe('ws://srv/ws?ticket=ok')
  })

  it('sem sessão (endereço null): não conecta nem agenda nova tentativa', async () => {
    const { ws, onLost } = make(async () => null)
    ws.connect()
    await settle()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(FakeSocket.instances).toHaveLength(0)
    expect(onLost).not.toHaveBeenCalled()
  })

  it('disconnect() enquanto o ticket chega: não abre a conexão', async () => {
    let resolve: (url: string) => void = () => {}
    const { ws } = make(() => new Promise((r) => (resolve = r)))
    ws.connect()
    ws.disconnect()
    resolve('ws://srv/ws?ticket=t')
    await settle()
    expect(FakeSocket.instances).toHaveLength(0)
  })

  it('connect() e retryNow() juntos: um pedido de ticket só', async () => {
    const getUrl = vi.fn(async () => 'ws://srv/ws?ticket=t')
    const { ws } = make(getUrl)
    ws.connect()
    ws.retryNow()
    await settle()
    expect(getUrl).toHaveBeenCalledTimes(1)
    expect(FakeSocket.instances).toHaveLength(1)
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

  const connected = async (): Promise<{
    ws: WsClient
    onLost: ReturnType<typeof vi.fn>
    onEvent: ReturnType<typeof vi.fn>
    socket: FakeSocket
  }> => {
    const onLost = vi.fn()
    const onEvent = vi.fn()
    const ws = new WsClient({ getToken: () => 'tok',
      getConnectUrl: async () => 'ws://srv/ws?ticket=t', getUserId: () => 'eu', onEvent, onLost })
    ws.connect()
    await settle()
    latest().open()
    return { ws, onLost, onEvent, socket: latest() }
  }

  it('manda ping a cada batimento e segue conectado enquanto o pong volta', async () => {
    const { onLost, socket } = await connected()
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(HEARTBEAT_EVERY_MS)
      pong(socket)
    }
    expect(pings(socket)).toBe(10)
    expect(onLost).not.toHaveBeenCalled()
    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('conexão meio aberta (o pong parou de vir): conta como queda e reconecta', async () => {
    const { onLost, socket } = await connected()
    await vi.advanceTimersByTimeAsync(HEARTBEAT_EVERY_MS)
    pong(socket) // o servidor responde: sabe o que é ping

    await vi.advanceTimersByTimeAsync(HEARTBEAT_EVERY_MS) // ping sem resposta
    expect(onLost).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(HEARTBEAT_EVERY_MS) // passou do prazo

    expect(onLost).toHaveBeenCalledWith({ attempt: 1, planned: false })
    await vi.advanceTimersByTimeAsync(1000)
    expect(FakeSocket.instances).toHaveLength(2)
    // A conexão morta não manda mais nada nem derruba a nova ao fechar atrasada.
    socket.drop(1006)
    expect(onLost).toHaveBeenCalledTimes(1)
  })

  it('servidor antigo (não responde pong): nunca derruba a conexão', async () => {
    const { onLost } = await connected()
    await vi.advanceTimersByTimeAsync(HEARTBEAT_EVERY_MS * 20)
    expect(onLost).not.toHaveBeenCalled()
    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('qualquer evento do servidor conta como sinal de vida', async () => {
    const { onLost, socket } = await connected()
    await vi.advanceTimersByTimeAsync(HEARTBEAT_EVERY_MS)
    pong(socket)
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(HEARTBEAT_EVERY_MS)
      socket.onmessage?.({ data: JSON.stringify({ type: 'presence:update', payload: {} }) })
    }
    expect(onLost).not.toHaveBeenCalled()
  })

  it('o pong não chega ao onEvent (não é evento do app)', async () => {
    const { onEvent, socket } = await connected()
    pong(socket)
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('disconnect() para o batimento', async () => {
    const { ws, socket } = await connected()
    ws.disconnect()
    await vi.advanceTimersByTimeAsync(HEARTBEAT_EVERY_MS * 3)
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

  it('recebe cada evento depois do onEvent do cliente, até desligar', async () => {
    const order: string[] = []
    const ws = new WsClient({
      getToken: () => 'tok',
      getConnectUrl: async () => 'ws://srv/ws?ticket=t',
      getUserId: () => 'eu',
      onEvent: (e) => order.push(`cliente:${e.type}`)
    })
    const off = onWsEvent((e) => order.push(`ouvinte:${e.type}`))
    ws.connect()
    await settle()
    latest().open()

    latest().onmessage?.({ data: JSON.stringify({ type: 'call:joined', payload: {} }) })
    off()
    latest().onmessage?.({ data: JSON.stringify({ type: 'call:left', payload: {} }) })

    expect(order).toEqual(['cliente:call:joined', 'ouvinte:call:joined', 'cliente:call:left'])
  })
})
