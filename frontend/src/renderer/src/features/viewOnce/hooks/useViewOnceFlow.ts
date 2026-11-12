import { useEffect, useRef, useState } from 'react'
import { showToast } from '../../../shared/store/toastStore'
import { openViewOnce } from '../api/viewOnce'
import {
  createViewOnceFlow,
  flowOutcome,
  viewerResult,
  type FlowOutcome,
  type FlowState,
  type ViewerOutcome,
  type ViewOnceFlow
} from '../lib/viewOnceFlow'
import { viewOnceSrc } from '../lib/viewOnceSrc'

export type { ViewerOutcome }

function setProtection(on: boolean): void {
  void window.api?.contentProtection?.set(on)
}

function report(o: FlowOutcome, err: unknown, onDone: (o: ViewerOutcome) => void): void {
  const { outcome, toast } = viewerResult(o, err)
  if (toast) showToast.error(toast)
  onDone(outcome)
}

/**
 * Liga o fluxo do visualizador ao React. Desmontar só solta o src e a proteção
 * (dispose); resultado só sai de fechar, Esc ou do fim da abertura. No
 * StrictMode o efeito roda duas vezes e não pode fechar o visualizador.
 */
export function useViewOnceFlow(
  attachmentId: string,
  onDone: (o: ViewerOutcome) => void
): { state: FlowState; flow: ViewOnceFlow | null } {
  const [state, setState] = useState<FlowState>({ phase: 'confirm', src: null })
  const [flow, setFlow] = useState<ViewOnceFlow | null>(null)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    let opened = false
    const f = createViewOnceFlow(
      attachmentId,
      { open: openViewOnce, src: viewOnceSrc, protect: setProtection },
      (s) => {
        opened = opened || s.phase === 'open'
        setState(s)
        const o = flowOutcome(s, opened)
        if (o) report(o, s.error, doneRef.current)
      }
    )
    setFlow(f)
    const onKey = (e: KeyboardEvent): void => f.onKey(e.key)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      f.dispose()
    }
  }, [attachmentId])

  return { state, flow }
}
