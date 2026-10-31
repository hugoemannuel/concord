import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  getAppSounds: vi.fn(),
  saveAppSounds: vi.fn(),
  uploadAppSound: vi.fn(),
  deleteAppSound: vi.fn()
}))
vi.mock('../api/appSounds', () => api)
vi.mock('../../../shared/lib/config', () => ({ API_BASE_URL: '/api' }))

import { useAuthStore, type User } from '../../auth/store/authStore'
import * as sounds from '../../call/lib/sounds'
import { useAppSoundsStore } from '../store/appSoundsStore'
import { startAppSounds } from './appSoundsStart'

const me = { id: 'eu', username: 'eu' } as User

beforeEach(() => {
  vi.clearAllMocks()
  api.getAppSounds.mockResolvedValue({ pack: 'bolhas', volume: 100, events: {}, custom: {} })
  useAuthStore.setState({ user: null })
  useAppSoundsStore.getState().reset()
})

describe('startAppSounds', () => {
  it('liga o handler no playSound e desliga no fim', () => {
    const spy = vi.spyOn(sounds, 'setSoundHandler')
    const stop = startAppSounds()
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ play: expect.any(Function) }))
    stop()
    expect(spy).toHaveBeenLastCalledWith(null)
  })

  it('carrega ao entrar e limpa ao sair da conta', async () => {
    const stop = startAppSounds()
    useAuthStore.setState({ user: me })
    await vi.waitFor(() => expect(useAppSoundsStore.getState().settings.pack).toBe('bolhas'))
    useAuthStore.setState({ user: { ...me } })
    expect(api.getAppSounds).toHaveBeenCalledTimes(1)
    useAuthStore.setState({ user: null })
    expect(useAppSoundsStore.getState().settings.pack).toBe('salinha')
    stop()
  })
})
