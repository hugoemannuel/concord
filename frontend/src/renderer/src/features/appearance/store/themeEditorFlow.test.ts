import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ getAppThemes: vi.fn(), saveAppThemes: vi.fn() }))
const prefs = vi.hoisted(() => ({ preference: 'discord-dark', setPreference: vi.fn() }))
vi.mock('../api/appThemes', () => api)
vi.mock('../../settings/store/themeStore', () => ({ useThemeStore: { getState: () => prefs } }))

import { useCustomThemesStore } from '../store/customThemesStore'
import { deleteDraft, saveDraft, type Draft } from './useCustomThemeEditor'

const DRAFT: Draft = {
  id: 'red1',
  name: '  Rubro  ',
  accent: '#e11d48',
  background: '#2a0a0a',
  sidebar: '#1f0707',
  card: '#3b0d0d',
  text: '#ffffff',
  glow: '',
  isNew: true
}

beforeEach(() => {
  vi.clearAllMocks()
  prefs.preference = 'discord-dark'
  useCustomThemesStore.setState({ themes: [], error: null, saving: false })
  api.saveAppThemes.mockImplementation(async (themes: unknown) => ({ themes }))
})

describe('saveDraft', () => {
  it('salva sem o isNew, com o nome aparado, e passa a usar o tema', async () => {
    expect(await saveDraft(DRAFT)).toBe(true)
    expect(api.saveAppThemes).toHaveBeenCalledWith([expect.objectContaining({ id: 'red1', name: 'Rubro' })])
    expect(api.saveAppThemes.mock.calls[0][0][0]).not.toHaveProperty('isNew')
    expect(prefs.setPreference).toHaveBeenCalledWith('custom-red1')
  })

  it('conta fora do ar: usa mesmo assim (cópia local) e devolve false', async () => {
    api.saveAppThemes.mockRejectedValue(new Error('500'))
    expect(await saveDraft(DRAFT)).toBe(false)
    expect(prefs.setPreference).toHaveBeenCalledWith('custom-red1')
    expect(useCustomThemesStore.getState().themes).toHaveLength(1)
  })
})

describe('deleteDraft', () => {
  it('apaga da conta e volta ao padrão se estava em uso', async () => {
    useCustomThemesStore.setState({ themes: [{ ...DRAFT, isNew: undefined } as never] })
    prefs.preference = 'custom-red1'
    await deleteDraft({ ...DRAFT, isNew: false })
    expect(api.saveAppThemes).toHaveBeenCalledWith([])
    expect(prefs.setPreference).toHaveBeenCalledWith('discord-dark')
  })

  it('rascunho novo (nunca salvo) não chama a conta; outro tema em uso fica', async () => {
    await deleteDraft(DRAFT)
    expect(api.saveAppThemes).not.toHaveBeenCalled()
    expect(prefs.setPreference).not.toHaveBeenCalled()
  })
})
