import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  fetchCatalog: vi.fn(),
  fetchServerPlugins: vi.fn(),
  installPlugin: vi.fn(),
  uninstallPlugin: vi.fn(),
  setPluginEnabled: vi.fn()
}))
vi.mock('../api/plugins', () => api)

import { usePluginsStore } from './pluginsStore'

const plugin = (id: string, enabled: boolean) => ({
  id,
  name: id,
  description: '',
  panel_url: 'https://x.test',
  author_username: 'a',
  status: 'approved' as const,
  enabled
})

describe('pluginsStore', () => {
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset())
    usePluginsStore.setState({ byServer: {}, catalog: null })
  })

  it('load guarda por servidor', async () => {
    api.fetchServerPlugins.mockResolvedValueOnce([plugin('a', true)])
    await usePluginsStore.getState().load('s1')
    expect(usePluginsStore.getState().byServer['s1']).toHaveLength(1)
    expect(usePluginsStore.getState().byServer['s2']).toBeUndefined()
  })

  it('loadCatalog guarda o catálogo', async () => {
    api.fetchCatalog.mockResolvedValueOnce([plugin('a', true)])
    await usePluginsStore.getState().loadCatalog()
    expect(usePluginsStore.getState().catalog).toHaveLength(1)
  })

  it('toggle é otimista', async () => {
    usePluginsStore.setState({ byServer: { s1: [plugin('a', false)] } })
    api.setPluginEnabled.mockResolvedValueOnce(undefined)
    await usePluginsStore.getState().toggle('s1', 'a', true)
    expect(usePluginsStore.getState().byServer['s1'][0].enabled).toBe(true)
    expect(api.setPluginEnabled).toHaveBeenCalledWith('s1', 'a', true)
  })

  it('toggle falhando volta ao valor anterior', async () => {
    usePluginsStore.setState({ byServer: { s1: [plugin('a', false)] } })
    api.setPluginEnabled.mockRejectedValueOnce(new Error('x'))
    await usePluginsStore.getState().toggle('s1', 'a', true)
    expect(usePluginsStore.getState().byServer['s1'][0].enabled).toBe(false)
  })

  it('install e uninstall recarregam o servidor', async () => {
    api.installPlugin.mockResolvedValue(undefined)
    api.uninstallPlugin.mockResolvedValue(undefined)
    api.fetchServerPlugins.mockResolvedValue([])
    await usePluginsStore.getState().install('s1', 'a')
    await usePluginsStore.getState().uninstall('s1', 'a')
    expect(api.fetchServerPlugins).toHaveBeenCalledTimes(2)
  })
})
