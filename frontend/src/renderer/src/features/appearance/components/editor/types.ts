import type { Draft } from '../../store/themeEditorStore'

/** Muda o rascunho; `key` junta mudanças seguidas do mesmo controle no desfazer. */
export type UpdateDraft = (patch: Partial<Draft>, key: string) => void

export interface GroupProps {
  draft: Draft
  update: UpdateDraft
}
