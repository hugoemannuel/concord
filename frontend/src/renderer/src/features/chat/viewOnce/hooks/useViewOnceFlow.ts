import { useEffect, useRef, useState } from 'react'
import { showToast } from '../../../../shared/store/toastStore'
import { openViewOnce } from '../api/viewOnce'
import {
  createViewOnceFlow,
  flowOutcome,
  type FlowOutcome,
  type FlowState,
  type ViewOnceFlow
} from '../lib/viewOnceFlow'
import { viewOnceSrc } from '../lib/viewOnceSrc'

export type ViewerOutcome = 'seen' | 'gone' | 'cancelled'

function setProtection(on: boolean): void {
  void window.api?.contentProtection?.set(on)
}

function report(o: FlowOutcome, onDone: (o: ViewerOutcome) => void): void {
  if (o === 'failed') showToast.error('Não foi possível carregar a prévia.')
  onDone(o === 'failed' ? 'cancelled' : o)
}

/** Liga o fluxo do visualizador ao React; ao desmontar, fecha (solta o src e a proteção). */
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
        if (o) report(o, doneRef.current)
      }
    )
    setFlow(f)
    const onKey = (e: KeyboardEvent): void => f.onKey(e.key)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      f.close()
    }
  }, [attachmentId])

  return { state, flow }
}
