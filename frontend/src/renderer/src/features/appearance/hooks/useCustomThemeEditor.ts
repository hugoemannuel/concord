import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_THEME } from '../../settings/lib/themes'
import { useThemeStore } from '../../settings/store/themeStore'
import {
  cleanName,
  customThemeKey,
  newCustomTheme,
  seedOf,
  type CustomTheme
} from '../lib/customThemes'
import { buildPalette, type Palette, type PaletteInput } from '../lib/palette'
import { customThemesCss } from '../lib/themeCss'
import { DRAFT_THEME_STYLE, writeStyleSheet } from '../lib/themeStyleSheet'
import { useCustomThemesStore } from '../store/customThemesStore'

/** data-theme da prévia ao vivo do editor. */
export const DRAFT_KEY = 'custom-draft'

export interface Draft extends CustomTheme {
  isNew: boolean
}

export interface CustomThemeEditor {
  draft: Draft | null
  palette: Palette | null
  saving: boolean
  error: string | null
  /** Novo tema partindo das cores do tema em uso. */
  startNew: () => void
  startEdit: (id: string) => void
  update: (patch: Partial<PaletteInput & { name: string }>) => void
  cancel: () => void
  /** Salva na conta e passa a usar o tema. */
  submit: () => Promise<void>
  /** Apaga o tema em edição (volta ao padrão se ele estava em uso). */
  removeDraft: () => Promise<void>
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

/** Rascunho do editor de tema próprio, com a prévia ao vivo num <style> próprio. */
export function useCustomThemeEditor(): CustomThemeEditor {
  const themes = useCustomThemesStore((s) => s.themes)
  const saving = useCustomThemesStore((s) => s.saving)
  const error = useCustomThemesStore((s) => s.error)
  const [draft, setDraft] = useState<Draft | null>(null)

  useEffect(() => {
    writeStyleSheet(DRAFT_THEME_STYLE, draft ? customThemesCss([{ key: DRAFT_KEY, input: draft }]) : '')
  }, [draft])
  useEffect(() => () => writeStyleSheet(DRAFT_THEME_STYLE, ''), [])

  const palette = useMemo(() => (draft ? buildPalette(draft) : null), [draft])

  const startNew = (): void => {
    const seed = seedOf(useThemeStore.getState().theme, themes)
    setDraft({ ...newCustomTheme(seed, themes), isNew: true })
  }

  const startEdit = (id: string): void => {
    const theme = themes.find((t) => t.id === id)
    if (theme) setDraft({ ...theme, isNew: false })
  }

  const update: CustomThemeEditor['update'] = (patch) => setDraft((d) => (d ? { ...d, ...patch } : d))

  const submit = async (): Promise<void> => {
    if (draft && (await saveDraft(draft))) setDraft(null)
  }

  const removeDraft = async (): Promise<void> => {
    if (!draft) return
    await deleteDraft(draft)
    setDraft(null)
  }

  return { draft, palette, saving, error, startNew, startEdit, update, cancel: () => setDraft(null), submit, removeDraft }
}
