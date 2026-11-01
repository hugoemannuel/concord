import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ getAppThemes: vi.fn(), saveAppThemes: vi.fn() }))
const prefs = vi.hoisted(() => ({ preference: 'discord-dark', theme: 'discord-dark', setPreference: vi.fn() }))
const live = vi.hoisted(() => ({ showDraft: vi.fn(), stopDraft: vi.fn(), DRAFT_KEY: 'custom-draft' }))
vi.mock('../api/appThemes', () => api)
vi.mock('../../settings/store/themeStore', () => ({ useThemeStore: { getState: () => prefs } }))
vi.mock('../lib/livePreview', () => live)

import { useSettingsStore } from '../../settings/store/settingsStore'
import { PRESET_SEEDS } from '../lib/presetSeeds'
import { withDefaults } from '../lib/themeInput'
import { useCustomThemesStore } from './customThemesStore'
import {
  cancelDraft,
  deleteDraft,
  removeDraft,
  runEditorKey,
  saveDraft,
  startEditTheme,
  startNewTheme,
  submitDraft,
  toggleSettingsView
} from './themeEditorFlow'
import { useThemeEditorStore, type Draft } from './themeEditorStore'

const DRAFT: Draft = {
  id: 'red1',
  name: '  Rubro  ',
  ...withDefaults({
    accent: '#e11d48',
    background: '#2a0a0a',
    sidebar: '#1f0707',
    card: '#3b0d0d',
    text: '#ffffff',
    glow: ''
  }),
  isNew: true
}

const editor = () => useThemeEditorStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  prefs.preference = 'discord-dark'
  prefs.theme = 'discord-dark'
  useCustomThemesStore.setState({ themes: [], error: null, saving: false })
  useThemeEditorStore.setState({ history: null, collapsed: false, hidSettings: false })
  useSettingsStore.setState({ open: true, section: 'appearance', dirty: false })
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
    const { isNew: _n, ...saved } = DRAFT
    useCustomThemesStore.setState({ themes: [saved] })
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

describe('sessão do editor', () => {
  it('novo tema parte do tema em uso e já aparece no app', () => {
    prefs.theme = 'midnight'
    startNewTheme()
    expect(editor().history?.present).toMatchObject({ isNew: true, accent: PRESET_SEEDS.midnight.accent })
    expect(live.showDraft).toHaveBeenCalledWith(expect.objectContaining({ accent: PRESET_SEEDS.midnight.accent }))
  })

  it('editar abre o tema salvo; id que não existe não abre', () => {
    const { isNew: _n, ...saved } = DRAFT
    useCustomThemesStore.setState({ themes: [saved] })
    startEditTheme('nada')
    expect(editor().history).toBeNull()
    startEditTheme('red1')
    expect(editor().history?.present).toMatchObject({ id: 'red1', isNew: false })
  })

  it('mudar, desfazer e refazer: cada passo vai para o app', () => {
    editor().open(DRAFT)
    editor().update({ accent: '#00ff00' }, 'accent')
    editor().undo()
    expect(editor().history?.present.accent).toBe(DRAFT.accent)
    editor().redo()
    expect(editor().history?.present.accent).toBe('#00ff00')
    expect(live.showDraft).toHaveBeenLastCalledWith(expect.objectContaining({ accent: '#00ff00' }))
  })

  it('cancelar fecha, tira a prévia e não salva nada', () => {
    editor().open(DRAFT)
    cancelDraft()
    expect(editor().history).toBeNull()
    expect(live.stopDraft).toHaveBeenCalled()
    expect(api.saveAppThemes).not.toHaveBeenCalled()
    expect(prefs.setPreference).not.toHaveBeenCalled()
  })

  it('salvar fecha; com erro na conta o editor fica aberto', async () => {
    editor().open(DRAFT)
    api.saveAppThemes.mockRejectedValueOnce(new Error('500'))
    await submitDraft()
    expect(editor().history).not.toBeNull()
    await submitDraft()
    expect(editor().history).toBeNull()
  })

  it('apagar fecha o editor', async () => {
    editor().open(DRAFT)
    await removeDraft()
    expect(editor().history).toBeNull()
  })

  it('"Ver o app" esconde as Configurações e elas voltam ao terminar', () => {
    editor().open(DRAFT)
    toggleSettingsView()
    expect(useSettingsStore.getState().open).toBe(false)
    expect(editor().hidSettings).toBe(true)
    toggleSettingsView()
    expect(useSettingsStore.getState().open).toBe(true)
    toggleSettingsView()
    cancelDraft()
    expect(useSettingsStore.getState()).toMatchObject({ open: true, section: 'appearance' })
  })

  it('atalhos: desfazer, refazer e Esc', () => {
    editor().open(DRAFT)
    editor().update({ accent: '#00ff00' }, 'accent')
    runEditorKey('undo')
    expect(editor().history?.present.accent).toBe(DRAFT.accent)
    runEditorKey('redo')
    expect(editor().history?.present.accent).toBe('#00ff00')
    runEditorKey('cancel')
    expect(editor().history).toBeNull()
  })
})
