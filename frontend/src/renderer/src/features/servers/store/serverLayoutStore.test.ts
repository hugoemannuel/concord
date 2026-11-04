import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RailLayoutItem } from '../lib/serverRailLayout'

const getLayoutMock = vi.fn()
const saveLayoutMock = vi.fn()

vi.mock('../api/serverLayout', () => ({
  getServerLayout: (...args: unknown[]) => getLayoutMock(...args),
  saveServerLayout: (...args: unknown[]) => saveLayoutMock(...args)
}))

vi.mock('../../auth/store/authStore', () => ({
  useAuthStore: { getState: () => ({ accessToken: 'tok-1' }) }
}))

const { useServerLayoutStore } = await import('./serverLayoutStore')

beforeEach(() => {
  getLayoutMock.mockReset()
  saveLayoutMock.mockReset()
  useServerLayoutStore.getState().reset()
})

describe('serverLayoutStore', () => {
  it('fetchLayout busca e guarda a lista do servidor', async () => {
    const items: RailLayoutItem[] = [{ kind: 'server', server_id: 's1' }]
    getLayoutMock.mockResolvedValueOnce(items)
    await useServerLayoutStore.getState().fetchLayout()
    expect(useServerLayoutStore.getState().items).toEqual(items)
    expect(useServerLayoutStore.getState().loaded).toBe(true)
  })

  it('saveLayout aplica otimisticamente e confirma com o retorno da API', async () => {
    const optimistic: RailLayoutItem[] = [
      { kind: 'folder', id: 'f1', name: 'Jogos', server_ids: ['s2', 's1'] }
    ]
    saveLayoutMock.mockImplementationOnce(async (x: RailLayoutItem[]) => x)
    await useServerLayoutStore.getState().saveLayout(optimistic)
    expect(useServerLayoutStore.getState().items).toEqual(optimistic)
  })

  it('saveLayout desfaz em caso de erro da API', async () => {
    const initial: RailLayoutItem[] = [{ kind: 'server', server_id: 's1' }]
    useServerLayoutStore.setState({ items: initial })
    saveLayoutMock.mockRejectedValueOnce(new Error('falha'))
    await expect(
      useServerLayoutStore.getState().saveLayout([{ kind: 'server', server_id: 's2' }])
    ).rejects.toThrow('falha')
    expect(useServerLayoutStore.getState().items).toEqual(initial)
  })

  it('toggleFolder alterna o estado recolhido/expandido da pasta', () => {
    expect(useServerLayoutStore.getState().collapsedFolders.f1).toBeFalsy()
    useServerLayoutStore.getState().toggleFolder('f1')
    expect(useServerLayoutStore.getState().collapsedFolders.f1).toBe(true)
    useServerLayoutStore.getState().toggleFolder('f1')
    expect(useServerLayoutStore.getState().collapsedFolders.f1).toBe(false)
  })

  it('handleWsEvent atualiza o layout quando chega server:layout', () => {
    const next: RailLayoutItem[] = [{ kind: 'server', server_id: 's3' }]
    useServerLayoutStore.getState().handleWsEvent({
      type: 'server:layout',
      payload: { items: next }
    })
    expect(useServerLayoutStore.getState().items).toEqual(next)
  })
})
