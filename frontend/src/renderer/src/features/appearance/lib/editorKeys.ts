// Teclado do editor de tema: o que cada tecla faz, dado onde está o foco. Puro.

export type EditorKeyAction = 'cancel' | 'undo' | 'redo' | null

export interface KeyInfo {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  defaultPrevented: boolean
}

export interface FocusInfo {
  /** O foco está num campo de texto (lá o Ctrl+Z é do próprio campo). */
  editable: boolean
  /** O foco está dentro do painel do editor. */
  inPanel: boolean
  /** Há um modal aberto por cima (o Esc é dele). */
  modalOpen: boolean
}

function undoAction(e: KeyInfo): EditorKeyAction {
  const k = e.key.toLowerCase()
  if (k === 'z') return e.shiftKey ? 'redo' : 'undo'
  return k === 'y' ? 'redo' : null
}

/**
 * Esc cancela (fora de um campo de texto alheio ao painel, como a caixa de
 * mensagem); Ctrl/⌘+Z desfaz e Ctrl/⌘+Shift+Z ou Ctrl+Y refazem, menos dentro
 * de um campo de texto.
 */
export function editorKeyAction(e: KeyInfo, focus: FocusInfo): EditorKeyAction {
  if (e.defaultPrevented || focus.modalOpen) return null
  if (e.key === 'Escape') return focus.editable && !focus.inPanel ? null : 'cancel'
  if (!(e.ctrlKey || e.metaKey) || focus.editable) return null
  return undoAction(e)
}

/** O pedaço do elemento em foco que importa (Element no app; objeto simples no teste). */
export interface ElementLike {
  tagName: string
  type?: string
  isContentEditable?: boolean
}

const TEXT_INPUTS = ['text', 'search', 'email', 'url', 'password', 'tel', 'number', '']

export function isEditableElement(el: ElementLike | null): boolean {
  if (!el) return false
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true
  return el.tagName === 'INPUT' && TEXT_INPUTS.includes(el.type ?? '')
}

const isElementLike = (v: unknown): v is ElementLike =>
  typeof v === 'object' && v !== null && typeof (v as ElementLike).tagName === 'string'

/** A ação de uma tecla, olhando onde está o foco (o alvo do evento) e o painel. */
export function keyActionForEvent(
  e: KeyInfo & { target: unknown },
  panel: { contains: (node: never) => boolean } | null,
  modalOpen: boolean
): EditorKeyAction {
  const target = isElementLike(e.target) ? e.target : null
  const inPanel = target !== null && panel !== null && panel.contains(target as never)
  return editorKeyAction(e, { editable: isEditableElement(target), inPanel, modalOpen })
}
