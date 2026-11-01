import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ getAppThemes: vi.fn(), saveAppThemes: vi.fn() }))
vi.mock('../api/appThemes', () => api)

import { CUSTOM_THEMES_STORAGE_KEY, type CustomTheme } from '../lib/customThemes'
import { useCustomThemesStore } from './customThemesStore'

const RED: CustomTheme = {
  id: 'red1',
  name: 'Vermelho',
  accent: '#e11d48',
  background: '#2a0a0a',
  sidebar: '#1f0707',
  card: '#3b0d0d',
  text: '#ffffff',
  glow: ''
}
const state = () => useCustomThemesStore.getState()

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    clear: () => data.clear(),
    key: (i) => [...data.keys()][i] ?? null,
    get length() {
      return data.size
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  globalThis.localStorage = memoryStorage()
  useCustomThemesStore.setState({ themes: [], error: null, saving: false })
  api.saveAppThemes.mockImplementation(async (themes: CustomTheme[]) => ({ themes }))
})

describe('customThemesStore', () => {
  it('load traz os temas da conta e guarda a cópia local', async () => {
    api.getAppThemes.mockResolvedValue({ themes: [RED, { id: 'lixo' }] })
    await state().load()
    expect(state().themes).toEqual([RED])
    expect(JSON.parse(localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY)!)).toEqual([RED])
  })

  it('load sem rede mantém a cópia local', async () => {
    useCustomThemesStore.setState({ themes: [RED] })
    api.getAppThemes.mockRejectedValue(new Error('offline'))
    await state().load()
    expect(state().themes).toEqual([RED])
  })

  it('save aplica na hora, manda a lista inteira e fica com a do servidor', async () => {
    const ok = await state().save(RED)
    expect(ok).toBe(true)
    expect(api.saveAppThemes).toHaveBeenCalledWith([RED])
    expect(state().themes).toEqual([RED])
    expect(state().error).toBeNull()
  })

  it('save que falha avisa e mantém o tema neste computador', async () => {
    api.saveAppThemes.mockRejectedValue(new Error('500'))
    const ok = await state().save(RED)
    expect(ok).toBe(false)
    expect(state().themes).toEqual([RED])
    expect(state().error).toMatch(/salvar/)
  })

  it('remove tira da lista e salva', async () => {
    useCustomThemesStore.setState({ themes: [RED] })
    await state().remove('red1')
    expect(state().themes).toEqual([])
    expect(api.saveAppThemes).toHaveBeenCalledWith([])
  })

  it('rehydrate relê a cópia local (outra janela mudou)', () => {
    localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify([RED]))
    state().rehydrate()
    expect(state().themes).toEqual([RED])
  })
})
