import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// No render estático o zustand devolve o estado inicial: stores de mentira.
const stores = vi.hoisted(() => {
  const custom = { themes: [] as unknown[], error: null, saving: false }
  const prefs = { preference: 'discord-dark', theme: 'discord-dark', setPreference: () => {} }
  const hook = <T,>(state: T) => Object.assign((sel: (s: T) => unknown) => sel(state), { getState: () => state })
  const editor = { history: null as unknown }
  return { custom, prefs, editor, useCustom: hook(custom), usePrefs: hook(prefs), useEditor: hook(editor) }
})
vi.mock('../store/customThemesStore', () => ({ useCustomThemesStore: stores.useCustom }))
vi.mock('../../settings/store/themeStore', () => ({ useThemeStore: stores.usePrefs }))
vi.mock('../store/themeEditorStore', () => ({ useThemeEditorStore: stores.useEditor }))

import { MAX_CUSTOM_THEMES, type CustomTheme } from '../lib/customThemes'
import { withDefaults } from '../lib/themeInput'
import { CustomThemesSection } from './CustomThemesSection'

const RED: CustomTheme = {
  id: 'red1',
  name: 'Rubro',
  ...withDefaults({
    accent: '#e11d48',
    background: '#2a0a0a',
    sidebar: '#1f0707',
    card: '#3b0d0d',
    text: '#ffffff',
    glow: ''
  })
}

beforeEach(() => {
  stores.custom.themes = []
  stores.prefs.preference = 'discord-dark'
  stores.editor.history = null
})

describe('CustomThemesSection', () => {
  it('sem temas: o texto da conta e o "Criar tema"', () => {
    const html = renderToStaticMarkup(<CustomThemesSection />)
    expect(html).toContain('Seus temas')
    expect(html).toContain('fica salvo na sua conta')
    expect(html).toContain('Criar tema')
    expect(html).not.toContain('Limite de')
  })

  it('lista os temas, marca o em uso e oferece editar', () => {
    stores.custom.themes = [RED, { ...RED, id: 'luz', name: 'Luz', background: '#ffffff' }]
    stores.prefs.preference = 'custom-red1'
    const html = renderToStaticMarkup(<CustomThemesSection />)
    expect(html).toContain('data-theme="custom-red1"')
    expect(html).toContain('data-scheme="light"')
    expect(html).toContain('aria-label="Editar Rubro"')
    expect(html).toMatch(/checked=""[^>]*value="custom-red1"|value="custom-red1"[^>]*checked=""/)
  })

  it('no limite, "Criar tema" desliga e explica', () => {
    stores.custom.themes = Array.from({ length: MAX_CUSTOM_THEMES }, (_, i) => ({ ...RED, id: `t${i}` }))
    const html = renderToStaticMarkup(<CustomThemesSection />)
    expect(html).toMatch(/disabled=""[^>]*>.*Criar tema/s)
    expect(html).toContain(`Limite de ${MAX_CUSTOM_THEMES} temas`)
  })

  it('com o editor aberto: avisa que as mudanças já aparecem no app e não abre outro', () => {
    stores.editor.history = { present: {} }
    const html = renderToStaticMarkup(<CustomThemesSection />)
    expect(html).toContain('cada mudança já aparece no app')
    expect(html).toMatch(/disabled=""[^>]*>.*Criar tema/s)
  })
})
