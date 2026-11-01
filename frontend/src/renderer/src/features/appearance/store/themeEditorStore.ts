import { create } from 'zustand'
import { record, redo, startHistory, undo, type History } from '../lib/editHistory'
import type { CustomTheme } from '../lib/customThemes'
import { showDraft, stopDraft } from '../lib/livePreview'

/** O tema em edição (isNew: ainda não foi salvo). */
export interface Draft extends CustomTheme {
  isNew: boolean
}

/**
 * Sessão do editor de tema próprio (painel flutuante, ver ThemeEditorPanel):
 * o rascunho com desfazer/refazer, se o painel está recolhido e se o editor
 * escondeu as Configurações para mostrar o app. Cada mudança no rascunho vai
 * para o app inteiro na hora (lib/livePreview). Fluxo de salvar/cancelar em
 * store/themeEditorFlow.ts.
 */
interface ThemeEditorState {
  /** null = editor fechado. */
  history: History<Draft> | null
  collapsed: boolean
  /** O editor fechou as Configurações para mostrar o app ("Ver o app"). */
  hidSettings: boolean
  open: (draft: Draft) => void
  /** `key` junta mudanças seguidas do mesmo controle num passo do desfazer. */
  update: (patch: Partial<Draft>, key: string) => void
  undo: () => void
  redo: () => void
  setCollapsed: (collapsed: boolean) => void
  setHidSettings: (hid: boolean) => void
  close: () => void
}

export const useThemeEditorStore = create<ThemeEditorState>()((set, get) => {
  const show = (history: History<Draft>): void => {
    set({ history })
    showDraft(history.present)
  }
  const step = (move: (h: History<Draft>) => History<Draft>): void => {
    const { history } = get()
    if (history) show(move(history))
  }
  return {
    history: null,
    collapsed: false,
    hidSettings: false,
    open: (draft) => {
      set({ collapsed: false })
      show(startHistory(draft))
    },
    update: (patch, key) => step((h) => record(h, { ...h.present, ...patch }, key, Date.now())),
    undo: () => step(undo),
    redo: () => step(redo),
    setCollapsed: (collapsed) => set({ collapsed }),
    setHidSettings: (hidSettings) => set({ hidSettings }),
    close: () => {
      stopDraft()
      set({ history: null, hidSettings: false })
    }
  }
})

/** O rascunho atual (null com o editor fechado). */
export const selectDraft = (s: ThemeEditorState): Draft | null => s.history?.present ?? null
