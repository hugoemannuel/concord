import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Channel } from '../api/channels'

const reorderChannels = vi.fn()
const listChannels = vi.fn()
vi.mock('../api/channels', () => ({
  listChannels: (...args: unknown[]) => listChannels(...args),
  createChannel: vi.fn(),
  deleteChannel: vi.fn(),
  reorderChannels: (...args: unknown[]) => reorderChannels(...args)
}))
vi.mock('../api/servers', () => ({}))
vi.mock('../api/invites', () => ({}))
vi.mock('../api/roles', () => ({}))
vi.mock('../../auth/store/authStore', () => ({
  useAuthStore: { getState: () => ({ accessToken: 't' }) }
}))

const { useServerStore } = await import('./serverStore')

const ch = (id: string, type: 'text' | 'voice'): Channel => ({
  id,
  type,
  server_id: 's1',
  name: id,
  created_by: 'u',
  created_at: '',
  updated_at: ''
})

const ids = (type: string): string[] =>
  useServerStore
    .getState()
    .channels.filter((c) => c.type === type)
    .map((c) => c.id)

/** Promessa controlada pelo teste (resposta HTTP pendente). */
function deferred(): { promise: Promise<void>; resolve: () => void; reject: (e: Error) => void } {
  let resolve: () => void = () => {}
  let reject: (e: Error) => void = () => {}
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

/** request_id mandado na chamada n (0-based) da API. */
const requestIdOf = (n: number): string => reorderChannels.mock.calls[n][3] as string

beforeEach(() => {
  reorderChannels.mockReset()
  listChannels.mockReset()
  listChannels.mockResolvedValue([])
  useServerStore.setState({
    currentServer: { id: 's1' } as never,
    channels: [ch('t1', 'text'), ch('v1', 'voice'), ch('t2', 'text'), ch('v2', 'voice')]
  })
})

describe('serverStore.reorderChannels', () => {
  it('muda a ordem na hora, antes da resposta, e manda um request_id', async () => {
    const res = deferred()
    reorderChannels.mockReturnValue(res.promise)
    const done = useServerStore.getState().reorderChannels('s1', 'text', ['t2', 't1'])
    expect(ids('text')).toEqual(['t2', 't1'])
    expect(ids('voice')).toEqual(['v1', 'v2'])
    res.resolve()
    await done
    expect(reorderChannels).toHaveBeenCalledWith('s1', 'text', ['t2', 't1'], expect.any(String))
    expect(ids('text')).toEqual(['t2', 't1'])
  })

  it('servidor recusou: volta a ordem de antes, ressincroniza e repassa o erro', async () => {
    reorderChannels.mockRejectedValue(new Error('sem permissão'))
    // A verdade do servidor, buscada depois da falha.
    listChannels.mockResolvedValue([
      ch('t1', 'text'),
      ch('v1', 'voice'),
      ch('t2', 'text'),
      ch('v2', 'voice')
    ])
    await expect(
      useServerStore.getState().reorderChannels('s1', 'voice', ['v2', 'v1'])
    ).rejects.toThrow('sem permissão')
    expect(ids('voice')).toEqual(['v1', 'v2'])
    expect(listChannels).toHaveBeenCalledWith('s1')
  })

  it('reordenações seguidas vão uma de cada vez, na ordem (a mais nova não é ultrapassada)', async () => {
    const a = deferred()
    const b = deferred()
    reorderChannels.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
    const s = useServerStore.getState()
    const pa = s.reorderChannels('s1', 'text', ['t2', 't1'])
    const pb = s.reorderChannels('s1', 'text', ['t1', 't2'])
    await flush()
    // B só sai depois que A responde.
    expect(reorderChannels).toHaveBeenCalledTimes(1)
    expect(ids('text')).toEqual(['t1', 't2'])
    a.resolve()
    await pa
    await flush()
    expect(reorderChannels).toHaveBeenCalledTimes(2)
    expect(reorderChannels.mock.calls[1][2]).toEqual(['t1', 't2'])
    b.resolve()
    await pb
    expect(ids('text')).toEqual(['t1', 't2'])
  })

  it('falha da mais antiga não desfaz uma reordenação local mais nova', async () => {
    const a = deferred()
    reorderChannels.mockReturnValueOnce(a.promise).mockResolvedValueOnce(undefined)
    useServerStore.setState({ channels: [ch('t1', 'text'), ch('t2', 'text'), ch('t3', 'text')] })
    listChannels.mockResolvedValue([ch('t3', 'text'), ch('t2', 'text'), ch('t1', 'text')])
    const s = useServerStore.getState()
    const pa = s.reorderChannels('s1', 'text', ['t2', 't1', 't3'])
    const pb = s.reorderChannels('s1', 'text', ['t3', 't2', 't1'])
    a.reject(new Error('rede'))
    await expect(pa).rejects.toThrow('rede')
    // Não volta para t1,t2,t3 (antes de A): B é mais nova.
    expect(ids('text')).toEqual(['t3', 't2', 't1'])
    await pb
    await flush()
    // A falha deixou a seção marcada: ressincroniza quando a fila esvazia.
    expect(listChannels).toHaveBeenCalledWith('s1')
    expect(ids('text')).toEqual(['t3', 't2', 't1'])
  })
})

describe('serverStore.receiveChannelOrder (WS)', () => {
  it('aplica a ordem de outro moderador no servidor aberto', () => {
    useServerStore.getState().receiveChannelOrder('s1', 'voice', ['v2', 'v1'])
    expect(ids('voice')).toEqual(['v2', 'v1'])
  })

  it('ignora evento de outro servidor', () => {
    useServerStore.getState().receiveChannelOrder('s2', 'voice', ['v2', 'v1'])
    expect(ids('voice')).toEqual(['v1', 'v2'])
  })

  it('ignora o eco da própria reordenação, mesmo chegando depois de uma mais nova', async () => {
    reorderChannels.mockResolvedValue(undefined)
    const s = useServerStore.getState()
    await s.reorderChannels('s1', 'text', ['t2', 't1'])
    await s.reorderChannels('s1', 'text', ['t1', 't2'])
    // O eco de A chega atrasado, depois de B: não pode voltar para A.
    s.receiveChannelOrder('s1', 'text', ['t2', 't1'], requestIdOf(0))
    expect(ids('text')).toEqual(['t1', 't2'])
    s.receiveChannelOrder('s1', 'text', ['t1', 't2'], requestIdOf(1))
    expect(ids('text')).toEqual(['t1', 't2'])
    expect(listChannels).not.toHaveBeenCalled()
  })

  it('evento de outro moderador durante a própria reordenação: espera e ressincroniza', async () => {
    const a = deferred()
    reorderChannels.mockReturnValueOnce(a.promise)
    const s = useServerStore.getState()
    const pa = s.reorderChannels('s1', 'text', ['t2', 't1'])
    s.receiveChannelOrder('s1', 'text', ['t1', 't2'], 'de-outra-pessoa')
    // Não pisca para a ordem do outro enquanto a nossa está a caminho.
    expect(ids('text')).toEqual(['t2', 't1'])
    a.resolve()
    await pa
    // Quem gravou por último no servidor vale: busca a lista de novo.
    expect(listChannels).toHaveBeenCalledWith('s1')
  })

  it('evento de outro moderador na outra seção é aplicado normalmente', async () => {
    const a = deferred()
    reorderChannels.mockReturnValueOnce(a.promise)
    const s = useServerStore.getState()
    const pa = s.reorderChannels('s1', 'text', ['t2', 't1'])
    s.receiveChannelOrder('s1', 'voice', ['v2', 'v1'], 'de-outra-pessoa')
    expect(ids('voice')).toEqual(['v2', 'v1'])
    a.resolve()
    await pa
    expect(listChannels).not.toHaveBeenCalled()
  })
})
