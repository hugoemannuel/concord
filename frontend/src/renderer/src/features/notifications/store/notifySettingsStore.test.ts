import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../auth/store/authStore'

const api = vi.hoisted(() => ({
  getNotifySettings: vi.fn(),
  setChannelNotifySettings: vi.fn(),
  setServerNotifySettings: vi.fn()
}))
vi.mock('../api/notificationSettings', () => api)

const { useNotifySettingsStore } = await import('./notifySettingsStore')

const muted = { muted: true, level: 'all', suppress_everyone: false }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  useNotifySettingsStore.getState().reset()
  useAuthStore.getState().clear()
  useAuthStore.getState().setTokens('A', 'R1')
})

describe('notifySettingsStore.fetchSettings', () => {
  it('guarda servidores e canais (ausente vira vazio), mesmo com o token renovado no meio', async () => {
    api.getNotifySettings.mockImplementation(async () => {
      useAuthStore.getState().setTokens('B', 'R2')
      return { servers: { s1: muted } }
    })
    await useNotifySettingsStore.getState().fetchSettings()
    expect(useNotifySettingsStore.getState().servers).toEqual({ s1: muted })
    expect(useNotifySettingsStore.getState().channels).toEqual({})
  })

  it('sair da conta no meio descarta a resposta', async () => {
    api.getNotifySettings.mockImplementation(async () => {
      useAuthStore.getState().clear()
      return { servers: { s1: muted }, channels: { c1: muted } }
    })
    await useNotifySettingsStore.getState().fetchSettings()
    expect(useNotifySettingsStore.getState().servers).toEqual({})
    expect(useNotifySettingsStore.getState().channels).toEqual({})
  })

  it('erro só loga e mantém o que havia', async () => {
    useNotifySettingsStore.setState({ servers: { s1: muted } as never })
    api.getNotifySettings.mockRejectedValue(new Error('x'))
    await useNotifySettingsStore.getState().fetchSettings()
    expect(useNotifySettingsStore.getState().servers).toEqual({ s1: muted })
  })
})
