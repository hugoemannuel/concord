import { createErrorQueue, type ErrorQueueOptions, type ErrorReport, type ReportInput } from './errorQueue'

const input = (message: string, frame = '    at fn (address at index.android.bundle:1:1)'): ReportInput => ({
  kind: 'TypeError',
  message,
  stack: `TypeError: ${message}\n${frame}`,
  screen: '/canal/:channelId',
  in_call: false,
  in_live: false
})

function setup(overrides: Partial<ErrorQueueOptions> = {}) {
  const sent: ErrorReport[][] = []
  let signedIn = true
  const send = jest.fn(async (batch: ErrorReport[]) => {
    sent.push(batch)
  })
  const queue = createErrorQueue({ send, canSend: () => signedIn, ...overrides })
  return { queue, sent, send, setSignedIn: (v: boolean) => (signedIn = v) }
}

describe('errorQueue', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('mesmo tipo + mensagem + 1º quadro: um só item, a contagem soma', async () => {
    const { queue, sent } = setup()
    queue.add(input('a'))
    queue.add(input('a'))
    queue.add(input('a'))
    await queue.flush()
    expect(sent).toEqual([[expect.objectContaining({ message: 'a', count: 3, source: 'mobile' })]])
  })

  it('1º quadro diferente: itens separados', async () => {
    const { queue, sent } = setup()
    queue.add(input('a', '    at f1@1:1'))
    queue.add(input('a', '    at f2@1:1'))
    await queue.flush()
    expect(sent[0]).toHaveLength(2)
  })

  it('até 10 por envio; o resto vai no próximo', async () => {
    const { queue, sent } = setup()
    for (let i = 0; i < 15; i++) queue.add(input(`e${i}`))
    await queue.flush()
    await queue.flush()
    expect(sent.map((b) => b.length)).toEqual([10, 5])
  })

  it('envia sozinho a cada 30 s depois de start()', async () => {
    const { queue, send } = setup()
    queue.start()
    queue.add(input('a'))
    await jest.advanceTimersByTimeAsync(29_999)
    expect(send).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(1)
    expect(send).toHaveBeenCalledTimes(1)
    queue.stop()
    queue.add(input('b'))
    await jest.advanceTimersByTimeAsync(60_000)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('timer injetável', () => {
    const timer = { setInterval: jest.fn(() => 7), clearInterval: jest.fn() }
    const { queue } = setup({ timer, intervalMs: 1000 })
    queue.start()
    queue.start()
    expect(timer.setInterval).toHaveBeenCalledTimes(1)
    expect(timer.setInterval).toHaveBeenCalledWith(expect.any(Function), 1000)
    queue.stop()
    expect(timer.clearInterval).toHaveBeenCalledWith(7)
  })

  it('até 50 chaves por sessão: a 51ª chave nova é descartada, repetição das antigas ainda conta', async () => {
    const { queue, sent } = setup()
    for (let i = 0; i < 50; i++) queue.add(input(`e${i}`))
    for (let i = 0; i < 5; i++) await queue.flush()
    queue.add(input('nova'))
    queue.add(input('e0'))
    await queue.flush()
    expect(sent.at(-1)).toEqual([expect.objectContaining({ message: 'e0', count: 1 })])
  })

  it('sem conta: segura (com o teto de 50) e manda quando entrar', async () => {
    const { queue, sent, setSignedIn } = setup()
    setSignedIn(false)
    for (let i = 0; i < 60; i++) queue.add(input(`e${i}`))
    await queue.flush()
    expect(sent).toEqual([])
    expect(queue.size()).toBe(50)
    setSignedIn(true)
    await queue.flush()
    expect(sent[0]).toHaveLength(10)
  })

  it('envio que falha: os erros voltam para a fila e somam com os novos', async () => {
    const { queue, sent, send } = setup()
    send.mockRejectedValueOnce(new Error('sem rede'))
    queue.add(input('a'))
    await queue.flush()
    queue.add(input('a'))
    await queue.flush()
    expect(sent.at(-1)).toEqual([expect.objectContaining({ message: 'a', count: 2 })])
  })

  it('fila vazia não envia', async () => {
    const { queue, send } = setup()
    await queue.flush()
    expect(send).not.toHaveBeenCalled()
  })

  it('flush durante um envio espera o mesmo envio (não manda em dobro)', async () => {
    let release = () => {}
    const send = jest.fn(() => new Promise<void>((resolve) => (release = resolve)))
    const { queue } = setup({ send })
    queue.add(input('a'))
    const first = queue.flush()
    const second = queue.flush()
    release()
    await Promise.all([first, second])
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('contagem para em 10 000', async () => {
    const { queue, sent } = setup()
    for (let i = 0; i < 10_005; i++) queue.add(input('laço'))
    await queue.flush()
    expect(sent[0][0].count).toBe(10_000)
  })
})
