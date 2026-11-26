import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ fetchChangelog: vi.fn(), fetchRequiredVersion: vi.fn() }))
vi.mock('../api/changelog', () => api)

import { useReleaseGateStore } from './releaseGateStore'

const release = { version: '1.2.0', released_at: '', summary: '', entries: [] }

beforeEach(() => {
  useReleaseGateStore.setState({ loaded: false, installed: null, minVersion: null, releases: [] })
  api.fetchChangelog.mockResolvedValue([release])
  api.fetchRequiredVersion.mockResolvedValue('1.1.0')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('releaseGateStore', () => {
  it('no desktop, carrega a versão instalada, as releases e a mínima', async () => {
    vi.stubGlobal('window', { api: { updates: { currentVersion: async () => '1.0.0' } } })
    await useReleaseGateStore.getState().load()
    expect(useReleaseGateStore.getState()).toMatchObject({
      loaded: true,
      installed: '1.0.0',
      minVersion: '1.1.0',
      releases: [release]
    })
  })

  it('na web não há versão instalada; falha de rede não trava (sem bloqueio, sem novidades)', async () => {
    vi.stubGlobal('window', {})
    api.fetchChangelog.mockRejectedValue(new Error('rede'))
    api.fetchRequiredVersion.mockRejectedValue(new Error('rede'))
    await useReleaseGateStore.getState().load()
    expect(useReleaseGateStore.getState()).toMatchObject({
      loaded: true,
      installed: null,
      minVersion: null,
      releases: []
    })
  })

  it('refreshRequired troca a mínima e mantém a anterior se falhar', async () => {
    await useReleaseGateStore.getState().refreshRequired()
    expect(useReleaseGateStore.getState().minVersion).toBe('1.1.0')
    api.fetchRequiredVersion.mockRejectedValue(new Error('rede'))
    await useReleaseGateStore.getState().refreshRequired()
    expect(useReleaseGateStore.getState().minVersion).toBe('1.1.0')
  })
})
