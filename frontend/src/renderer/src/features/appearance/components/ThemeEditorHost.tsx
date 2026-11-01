import { selectDraft, useThemeEditorStore } from '../store/themeEditorStore'
import { ThemeEditorPanel } from './editor/ThemeEditorPanel'

/** Monta o editor de tema (fica no App: sobrevive a fechar as Configurações). */
export function ThemeEditorHost(): React.JSX.Element | null {
  const draft = useThemeEditorStore(selectDraft)
  return draft ? <ThemeEditorPanel draft={draft} /> : null
}
