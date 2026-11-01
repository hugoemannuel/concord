import { WsClient, onWsEvent, type WsEvent } from './ws'

class FakeSocket {
  static instances: FakeSocket[] = []
  static OPEN = 1
  static CONNECTING = 0
  readyState = FakeSocket.CONNECTING
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: ((e: { code: number }) => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) {
    FakeSocket.instances.push(this)
  }
  send(raw: string) {
    this.sent.push(raw)
  }
  close() {
    this.readyState = 3
  }
  open() {
    this.readyState = FakeSocket.OPEN
    this.onopen?.()
  }
  drop(code = 1006) {
    this.readyState = 3
    this.onclose?.({ code })
  }
  message(event: WsEvent) {
    this.onmessage?.({ data: JSON.stringify(event) })
  }
}

const last = () => FakeSocket.instances[FakeSocket.instances.length - 1]

/** O endereço (ticket) chega numa promessa: deixa ela resolver. */
const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

function makeClient(token: string | null = 'tok', getConnectUrl?: () => Promise<string | null>) {
  const onEvent = jest.fn()
  const onOpen = jest.fn()
  const onLost = jest.fn()
  const client = new WsClient({
    getToken: () => token,
    getConnectUrl: getConnectUrl ?? (async () => (token ? 'ws://localhost:8080/ws?ticket=t&client=mobile' : null)),
    getUserId: () => 'u1',
    onEvent,
    onOpen,
    onLost
  })
  return { client, onEvent, onOpen, onLost }
}

beforeEach(() => {
  jest.useFakeTimers()
  FakeSocket.instances = []
  ;(global as unknown as { WebSocket: unknown }).WebSocket = FakeSocket
})

afterEach(() => jest.useRealTimers())

describe('WsClient', () => {
  it('conecta com o ticket na URL e assina a sala do usuário', async () => {
    const { client, onOpen } = makeClient()
    client.connect()
    await settle()
    // O servidor só manda push quando o app do celular não está aberto: ele se identifica com client=mobile.
    expect(last().url).toBe('ws://localhost:8080/ws?ticket=t&client=mobile')
    last().open()
    expect(JSON.parse(last().sent[0])).toEqual({ type: 'subscribe', payload: { room: 'user:u1' } })
    expect(onOpen).toHaveBeenCalledWith(false)
  })

  it('sem token não conecta', async () => {
    makeClient(null).client.connect()
    await settle()
    expect(FakeSocket.instances).toHaveLength(0)
  })

  it('entrega o evento ao onEvent e aos ouvintes extras', async () => {
    const { client, onEvent } = makeClient()
    const extra = jest.fn()
    const off = onWsEvent(extra)
    client.connect()
    await settle()
    last().open()
    last().message({ type: 'typing', payload: { a: 1 } })
    expect(onEvent).toHaveBeenCalledWith({ type: 'typing', payload: { a: 1 } })
    expect(extra).toHaveBeenCalledTimes(1)
    off()
    last().message({ type: 'typing', payload: {} })
    expect(extra).toHaveBeenCalledTimes(1)
  })

  it('quadro malformado é ignorado', async () => {
    const { client, onEvent } = makeClient()
    client.connect()
    await settle()
    last().open()
    last().onmessage?.({ data: '{quebrado' })
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('reconecta com backoff depois de cair e avisa que reconectou', async () => {
    const { client, onOpen, onLost } = makeClient()
    client.connect()
    await settle()
    last().open()
    last().drop()
    expect(onLost).toHaveBeenCalledWith({ attempt: 1, planned: false })
    expect(FakeSocket.instances).toHaveLength(1)
    await jest.advanceTimersByTimeAsync(1000)
    expect(FakeSocket.instances).toHaveLength(2)
    last().open()
    expect(onOpen).toHaveBeenLastCalledWith(true)
  })

  it('reinício planejado (1012) reconecta em até 300 ms', async () => {
    const { client, onLost } = makeClient()
    client.connect()
    await settle()
    last().open()
    last().drop(1012)
    expect(onLost).toHaveBeenCalledWith({ attempt: 1, planned: true })
    await jest.advanceTimersByTimeAsync(300)
    expect(FakeSocket.instances).toHaveLength(2)
  })

  it('disconnect não reconecta', async () => {
    const { client } = makeClient()
    client.connect()
    await settle()
    last().open()
    client.disconnect()
    last().drop()
    await jest.advanceTimersByTimeAsync(60_000)
    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('retryNow pula a espera do backoff', async () => {
    const { client } = makeClient()
    client.connect()
    await settle()
    last().open()
    last().drop()
    client.retryNow()
    await settle()
    expect(FakeSocket.instances).toHaveLength(2)
  })

  it('retryNow com a conexão ativa não abre outra', async () => {
    const { client } = makeClient()
    client.connect()
    await settle()
    last().open()
    client.retryNow()
    await settle()
    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('suspend fecha a conexão sem reconectar (o servidor passa a ver a pessoa offline e manda push)', async () => {
    const { client, onLost } = makeClient()
    client.connect()
    await settle()
    last().open()
    const socket = last()
    client.suspend()
    expect(socket.readyState).toBe(3)
    socket.drop(1000)
    await jest.advanceTimersByTimeAsync(120_000)
    expect(FakeSocket.instances).toHaveLength(1)
    expect(onLost).not.toHaveBeenCalled()
    expect(client.isConnected()).toBe(false)
  })

  it('suspenso, nem retryNow (volta da rede) nem o backoff reabrem; resume reabre, reassina e avisa que reconectou', async () => {
    const { client, onOpen } = makeClient()
    client.connect()
    await settle()
    last().open()
    client.subscribe('channel:c1')
    client.suspend()
    client.retryNow()
    await settle()
    expect(FakeSocket.instances).toHaveLength(1)
    client.resume()
    await settle()
    expect(FakeSocket.instances).toHaveLength(2)
    last().open()
    const rooms = last().sent.map((raw) => JSON.parse(raw).payload.room)
    expect(rooms).toEqual(expect.arrayContaining(['user:u1', 'channel:c1']))
    expect(onOpen).toHaveBeenLastCalledWith(true)
  })

  it('suspend cancela a reconexão que estava agendada', async () => {
    const { client } = makeClient()
    client.connect()
    await settle()
    last().open()
    last().drop()
    client.suspend()
    await jest.advanceTimersByTimeAsync(120_000)
    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('reassina as salas ao reconectar', async () => {
    const { client } = makeClient()
    client.connect()
    await settle()
    last().open()
    client.subscribe('channel:c1')
    last().drop()
    await jest.advanceTimersByTimeAsync(1000)
    last().open()
    const rooms = last().sent.map((raw) => JSON.parse(raw).payload.room)
    expect(rooms).toEqual(expect.arrayContaining(['user:u1', 'channel:c1']))
  })

  it('pede um ticket novo a cada tentativa', async () => {
    let n = 0
    const { client } = makeClient('tok', async () => `ws://x/ws?ticket=t${++n}&client=mobile`)
    client.connect()
    await settle()
    last().open()
    last().drop()
    await jest.advanceTimersByTimeAsync(1000)
    expect(last().url).toBe('ws://x/ws?ticket=t2&client=mobile')
  })

  it('pedir o ticket falhou: conta como queda e tenta de novo com espera', async () => {
    const getUrl = jest.fn().mockRejectedValueOnce(new Error('rede')).mockResolvedValue('ws://x/ws?ticket=ok')
    const { client, onLost } = makeClient('tok', getUrl)
    client.connect()
    await settle()
    expect(FakeSocket.instances).toHaveLength(0)
    expect(onLost).toHaveBeenCalledWith({ attempt: 1, planned: false })
    await jest.advanceTimersByTimeAsync(1000)
    expect(last().url).toBe('ws://x/ws?ticket=ok')
  })

  it('suspend enquanto o ticket chega: não abre a conexão', async () => {
    let resolve: (url: string) => void = () => {}
    const { client } = makeClient('tok', () => new Promise((r) => (resolve = r)))
    client.connect()
    client.suspend()
    resolve('ws://x/ws?ticket=t')
    await settle()
    expect(FakeSocket.instances).toHaveLength(0)
  })

  it('connect e retryNow juntos: um pedido de ticket só', async () => {
    const getUrl = jest.fn(async () => 'ws://x/ws?ticket=t')
    const { client } = makeClient('tok', getUrl)
    client.connect()
    client.retryNow()
    await settle()
    expect(getUrl).toHaveBeenCalledTimes(1)
    expect(FakeSocket.instances).toHaveLength(1)
  })
})
