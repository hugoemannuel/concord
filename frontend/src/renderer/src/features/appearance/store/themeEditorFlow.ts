// O fluxo do editor de tema próprio entre os stores: começar (novo ou editar),
// salvar na conta e usar, cancelar (o app volta exatamente ao tema de antes),
// apagar e o "Ver o app" que esconde as Configurações. Ver ThemeEditorPanel.

import { DEFAULT_THEME } from '../../settings/lib/themes'
import { useSettingsStore } from '../../settings/store/settingsStore'
import { useThemeStore } from '../../settings/store/themeStore'
import { cleanName, customThemeKey, newCustomTheme, seedOf } from '../lib/customThemes'
import { useCustomThemesStore } from './customThemesStore'
import { useThemeEditorStore, type Draft } from './themeEditorStore'

/** Novo tema partindo das cores (e da forma) do tema em uso. */
export function startNewTheme(): void {
  const { themes } = useCustomThemesStore.getState()
  const seed = seedOf(useThemeStore.getState().theme, themes)
  useThemeEditorStore.getState().open({ ...newCustomTheme(seed, themes), isNew: true })
}

export function startEditTheme(id: string): void {
  const theme = useCustomThemesStore.getState().themes.find((t) => t.id === id)
  if (theme) useThemeEditorStore.getState().open({ ...theme, isNew: false })
}

/** Salva o rascunho na conta e passa a usar o tema; true se a conta aceitou. */
export async function saveDraft(draft: Draft): Promise<boolean> {
  const { isNew: _isNew, ...theme } = draft
  const ok = await useCustomThemesStore.getState().save({ ...theme, name: cleanName(theme.name) })
  // Mesmo sem a conta o tema ficou na cópia local: já dá para usar.
  useThemeStore.getState().setPreference(customThemeKey(theme.id))
  return ok
}

/** Apaga o tema do rascunho; se ele estava em uso, volta ao padrão. */
export async function deleteDraft(draft: Draft): Promise<void> {
  if (!draft.isNew) await useCustomThemesStore.getState().remove(draft.id)
  if (useThemeStore.getState().preference === customThemeKey(draft.id)) {
    useThemeStore.getState().setPreference(DEFAULT_THEME)
  }
}

/** Fecha o editor; se ele tinha escondido as Configurações, elas voltam. */
function finish(): void {
  const { hidSettings, close } = useThemeEditorStore.getState()
  close()
  if (hidSettings) useSettingsStore.getState().openSettings('appearance')
}

const current = (): Draft | null => useThemeEditorStore.getState().history?.present ?? null

export async function submitDraft(): Promise<void> {
  const draft = current()
  if (draft && (await saveDraft(draft))) finish()
}

/** Cancelar/Esc: descarta o rascunho; o app volta ao tema de antes. */
export function cancelDraft(): void {
  finish()
}

export async function removeDraft(): Promise<void> {
  const draft = current()
  if (!draft) return
  await deleteDraft(draft)
  finish()
}

/** "Ver o app" ↔ "Configurações": esconde ou traz de volta a tela de Configurações. */
export function toggleSettingsView(): void {
  const settings = useSettingsStore.getState()
  const editor = useThemeEditorStore.getState()
  if (settings.open) {
    settings.close()
    editor.setHidSettings(!useSettingsStore.getState().open)
  } else {
    settings.openSettings('appearance')
    editor.setHidSettings(false)
  }
}

/** Atalho de teclado do editor (hooks/useThemeEditorKeys). */
export function runEditorKey(action: 'cancel' | 'undo' | 'redo'): void {
  if (action === 'cancel') cancelDraft()
  else useThemeEditorStore.getState()[action]()
}
