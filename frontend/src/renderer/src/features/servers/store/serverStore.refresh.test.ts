import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Server, ServerMember } from '../api/servers'

// Recarregar o servidor que já está na tela (server:update…) não pode trocar a
// tela pelo "Carregando servidor...".

const getServer = vi.fn()
vi.mock('../api/servers', () => ({
  getServer: (...args: unknown[]) => getServer(...args)
}))
vi.mock('../api/channels', () => ({}))
vi.mock('../api/roles', () => ({}))
vi.mock('../../auth/store/authStore', () => ({
  useAuthStore: { getState: () => ({ accessToken: 't' }) }
}))

const { useServerStore } = await import('./serverStore')

const server = (id: string, name = id): Server => ({ id, name, owner_id: 'ana' })
const member = (userId: string, serverId = 's1'): ServerMember => ({
  server_id: serverId,
  user_id: userId,
  role: 'member'
})

/** Resposta HTTP que o teste resolve quando quiser. */
function deferred<T>(): {
  promise: Promise<T>
  resolve: (v: T) => void
  reject: (e: Error) => void
} {
  let resolve: (v: T) => void = () => {}
  let reject: (e: Error) => void = () => {}
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Grava cada mudança do store: se algum momento ficou "carregando" ou vazio. */
function recordStates(): { loading: boolean[]; blank: boolean[]; stop: () => void } {
  const loading: boolean[] = []
  const blank: boolean[] = []
  const stop = useServerStore.subscribe((s) => {
    loading.push(s.loading)
    blank.push(!s.currentServer || s.currentMembers.length === 0)
  })
  return { loading, blank, stop }
}

beforeEach(() => {
  getServer.mockReset()
  getServer.mockResolvedValue({ server: server('s1'), members: [member('ana')], roles: [] })
  useServerStore.setState({
    currentServer: server('s1'),
    currentMembers: [member('ana')],
    roles: [],
    loading: false
  })
})

describe('selectServer', () => {
  it('abrir outro servidor mostra o carregando (não há o que mostrar ainda)', async () => {
    const res = deferred<unknown>()
    getServer.mockReturnValueOnce(res.promise)
    const p = useServerStore.getState().selectServer('s2')
    expect(useServerStore.getState().loading).toBe(true)
    res.resolve({ server: server('s2'), members: [member('ana', 's2')], roles: [] })
    await p
    expect(useServerStore.getState().loading).toBe(false)
    expect(useServerStore.getState().currentServer?.id).toBe('s2')
  })

  it('recarregar o servidor aberto mantém os dados na tela enquanto busca', async () => {
    const res = deferred<unknown>()
    getServer.mockReturnValueOnce(res.promise)
    const rec = recordStates()
    const p = useServerStore.getState().selectServer('s1')
    expect(useServerStore.getState().loading).toBe(false)
    expect(useServerStore.getState().currentMembers).toHaveLength(1)

    res.resolve({
      server: server('s1', 'Novo nome'),
      members: [member('ana'), member('bia')],
      roles: []
    })
    await p
    rec.stop()

    expect(rec.loading).not.toContain(true)
    expect(rec.blank).not.toContain(true)
    expect(useServerStore.getState().currentServer?.name).toBe('Novo nome')
    expect(useServerStore.getState().currentMembers.map((m) => m.user_id)).toEqual(['ana', 'bia'])
  })

  it('falha ao recarregar o servidor aberto não apaga o que já está na tela', async () => {
    getServer.mockRejectedValueOnce(new Error('rede fora'))
    await expect(useServerStore.getState().selectServer('s1')).rejects.toThrow('rede fora')
    expect(useServerStore.getState().currentServer?.id).toBe('s1')
    expect(useServerStore.getState().currentMembers).toHaveLength(1)
    expect(useServerStore.getState().loading).toBe(false)
  })

  it('resposta atrasada de um servidor antigo não sobrescreve o aberto agora', async () => {
    const slow = deferred<unknown>()
    getServer.mockReturnValueOnce(slow.promise)
    const first = useServerStore.getState().selectServer('s1')
    getServer.mockResolvedValueOnce({
      server: server('s2'),
      members: [member('ana', 's2')],
      roles: []
    })
    await useServerStore.getState().selectServer('s2')

    slow.resolve({ server: server('s1'), members: [member('ana')], roles: [] })
    await first
    expect(useServerStore.getState().currentServer?.id).toBe('s2')
    expect(useServerStore.getState().loading).toBe(false)
  })
})
