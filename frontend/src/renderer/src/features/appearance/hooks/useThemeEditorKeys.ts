import { useEffect, type RefObject } from 'react'
import { modalStack } from '../../../shared/lib/modalStack'
import { keyActionForEvent } from '../lib/editorKeys'
import { runEditorKey } from '../store/themeEditorFlow'

/**
 * Esc cancela a edição (antes das Configurações, que também fecham no Esc) e
 * Ctrl+Z / Ctrl+Shift+Z desfazem e refazem. Escuta na captura da janela.
 */
export function useThemeEditorKeys(panel: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const action = keyActionForEvent(e, panel.current, modalStack.hasOpen())
      if (!action) return
      e.preventDefault()
      runEditorKey(action)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [panel])
}
