import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// No render estático o zustand devolve o estado inicial: stores de mentira.
const stores = vi.hoisted(() => {
  const editor = {
    history: { past: [1], future: [] as unknown[] } as unknown,
    collapsed: false,
    undo: () => {},
    redo: () => {},
    setCollapsed: () => {}
  }
  const settings = { open: true }
  const custom = { saving: false, error: null as string | null }
  const hook = <T,>(state: T) => Object.assign((sel: (s: T) => unknown) => sel(state), { getState: () => state })
  return { editor, settings, custom, useEditor: hook(editor), useSettings: hook(settings), useCustom: hook(custom) }
})
vi.mock('../../store/themeEditorStore', () => ({ useThemeEditorStore: stores.useEditor, selectDraft: () => null }))
vi.mock('../../../settings/store/settingsStore', () => ({ useSettingsStore: stores.useSettings }))
vi.mock('../../store/customThemesStore', () => ({ useCustomThemesStore: stores.useCustom }))

import { buildPalette } from '../../lib/palette'
import { PRESET_SEEDS } from '../../lib/presetSeeds'
import type { Draft } from '../../store/themeEditorStore'
import { ThemeEditorHost } from '../ThemeEditorHost'
import { PanelFooter } from './PanelFooter'
import { PanelHeader } from './PanelHeader'

const DRAFT: Draft = { id: 'x', name: 'Rubro', ...PRESET_SEEDS['discord-dark'], isNew: false }

beforeEach(() => {
  stores.settings.open = true
  stores.editor.collapsed = false
  stores.custom.error = null
})

describe('cabeçalho do painel', () => {
  it('desfazer liga com histórico, refazer não; "Ver o app" com as configurações abertas', () => {
    const html = renderToStaticMarkup(<PanelHeader draft={DRAFT} titleId="t" />)
    expect(html).toContain('Editar tema')
    expect(html).toMatch(/aria-label="Refazer[^"]*"[^>]*disabled=""|disabled=""[^>]*aria-label="Refazer/)
    expect(html).not.toMatch(/aria-label="Desfazer[^"]*"[^>]*disabled=""|disabled=""[^>]*aria-label="Desfazer/)
    expect(html).toContain('Ver o app')
    expect(html).toContain('Recolher o editor')
  })

  it('configurações fechadas e painel recolhido', () => {
    stores.settings.open = false
    stores.editor.collapsed = true
    const html = renderToStaticMarkup(<PanelHeader draft={{ ...DRAFT, isNew: true }} titleId="t" />)
    expect(html).toContain('Novo tema')
    expect(html).toContain('Voltar às configurações')
    expect(html).toContain('Abrir o editor')
  })
})

describe('rodapé do painel', () => {
  it('ações, aviso do que foi ajustado e erro da conta', () => {
    stores.custom.error = 'Não foi possível salvar na sua conta.'
    const palette = buildPalette({ ...DRAFT, text: '#202020' })
    const html = renderToStaticMarkup(<PanelFooter draft={DRAFT} palette={palette} />)
    expect(html).toContain('Salvar e usar')
    expect(html).toContain('Cancelar')
    expect(html).toContain('Apagar')
    expect(html).toContain('Ajustamos o texto para dar para ler.')
    expect(html).toContain('role="alert"')
  })

  it('tema novo não tem apagar', () => {
    const html = renderToStaticMarkup(<PanelFooter draft={{ ...DRAFT, isNew: true }} palette={buildPalette(DRAFT)} />)
    expect(html).not.toContain('Apagar')
  })
})

describe('ThemeEditorHost', () => {
  it('editor fechado: nada', () => {
    expect(renderToStaticMarkup(<ThemeEditorHost />)).toBe('')
  })
})
