import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  getAppSounds: vi.fn(),
  saveAppSounds: vi.fn(),
  uploadAppSound: vi.fn(),
  deleteAppSound: vi.fn()
}))
const meta = vi.hoisted(() => ({ readMediaMeta: vi.fn() }))
vi.mock('../api/appSounds', () => api)
vi.mock('../../chat/lib/readMediaMeta', () => meta)

import { ApiError } from '../../../shared/api/client'
import { DEFAULT_APP_SOUNDS } from '../lib/choice'
import { SAVE_DELAY_MS, useAppSoundsStore } from './appSoundsStore'

const FILE = '/api/app-sounds/8f14e45f-ceea-4e7a-9f6b-1f3a2b4c5d6e'
const ogg = (size = 1000): File => {
  const f = new File(['x'], 'a.ogg', { type: 'audio/ogg' })
  Object.defineProperty(f, 'size', { value: size })
  return f
}
const state = () => useAppSoundsStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  state().reset()
  api.saveAppSounds.mockResolvedValue({})
  meta.readMediaMeta.mockResolvedValue({ duration_ms: 800 })
})
afterEach(() => vi.useRealTimers())

describe('appSoundsStore', () => {
  it('load traz as escolhas e os áudios do servidor', async () => {
    api.getAppSounds.mockResolvedValue({ pack: 'cristal', volume: 120, events: { mute: 'off' }, custom: { knock: FILE } })
    await state().load()
    expect(state().settings).toEqual({ pack: 'cristal', volume: 120, events: { mute: 'off' } })
    expect(state().custom).toEqual({ knock: FILE })
  })

  it('load sem rede mantém a cópia local', async () => {
    useAppSoundsStore.setState({ settings: { ...DEFAULT_APP_SOUNDS, pack: 'bolhas' } })
    api.getAppSounds.mockRejectedValue(new Error('offline'))
    await state().load()
    expect(state().settings.pack).toBe('bolhas')
  })

  it('update aplica na hora e salva uma vez só depois de parar de mexer', async () => {
    state().update({ ...DEFAULT_APP_SOUNDS, volume: 110 })
    state().update({ ...DEFAULT_APP_SOUNDS, volume: 120 })
    expect(state().settings.volume).toBe(120)
    expect(api.saveAppSounds).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS)
    expect(api.saveAppSounds).toHaveBeenCalledTimes(1)
    expect(api.saveAppSounds).toHaveBeenCalledWith({ ...DEFAULT_APP_SOUNDS, volume: 120 })
  })

  it('falha ao salvar vira erro geral', async () => {
    api.saveAppSounds.mockRejectedValue(new Error('x'))
    state().update({ ...DEFAULT_APP_SOUNDS, pack: 'cristal' })
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS)
    expect(state().error).toEqual({ event: null, message: 'Não foi possível salvar os sons. Tente de novo.' })
  })

  it('upload mede, sobe e passa o evento para o áudio próprio', async () => {
    api.uploadAppSound.mockResolvedValue({ custom: { mention: FILE } })
    const file = ogg()
    await state().upload('mention', file)
    expect(api.uploadAppSound).toHaveBeenCalledWith('mention', file, 800)
    expect(state().custom).toEqual({ mention: FILE })
    expect(state().settings.events.mention).toBe('custom')
    expect(state().busy).toBeNull()
  })

  it('upload recusa formato, tamanho e duração antes de subir', async () => {
    await state().upload('mute', new File(['x'], 'a.webm', { type: 'audio/webm' }))
    expect(state().error).toEqual({ event: 'mute', message: 'Use um áudio MP3, OGG, WAV ou M4A.' })
    await state().upload('mute', ogg(2 * 1024 * 1024))
    expect(state().error?.message).toBe('O som pode ter até 1 MB.')
    meta.readMediaMeta.mockResolvedValue({ duration_ms: 9000 })
    await state().upload('mute', ogg())
    expect(state().error?.message).toBe('O som precisa ter entre 0,1 s e 5 s.')
    expect(api.uploadAppSound).not.toHaveBeenCalled()
  })

  it('erro do servidor no upload aparece no evento e não troca a escolha', async () => {
    api.uploadAppSound.mockRejectedValue(new ApiError(507, 'x'))
    await state().upload('mute', ogg())
    expect(state().error).toEqual({ event: 'mute', message: 'O servidor está sem espaço agora. Tente mais tarde.' })
    expect(state().settings.events.mute).toBeUndefined()
  })

  it('remover o áudio volta o evento ao pacote', async () => {
    useAppSoundsStore.setState({ settings: { ...DEFAULT_APP_SOUNDS, events: { knock: 'custom' } }, custom: { knock: FILE } })
    api.deleteAppSound.mockResolvedValue({ custom: {} })
    await state().removeCustom('knock')
    expect(state().custom).toEqual({})
    expect(state().settings.events.knock).toBeUndefined()
  })

  it('enquanto um envio roda, outro não começa', async () => {
    useAppSoundsStore.setState({ busy: { event: 'mute', kind: 'upload' } })
    await state().upload('knock', ogg())
    await state().removeCustom('knock')
    expect(meta.readMediaMeta).not.toHaveBeenCalled()
    expect(api.deleteAppSound).not.toHaveBeenCalled()
  })
})
