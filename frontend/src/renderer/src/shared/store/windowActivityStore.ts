import { create } from 'zustand'
import {
  ACTIVE_WINDOW,
  inBackground,
  sameActivity,
  type WindowActivity
} from '../../../../shared/windowActivity'

// Foco/visibilidade da janela (avisados pelo main; no web, pelo navegador).
// Quem desenha em laço (canvas, rAF, vídeo) consulta useInBackground() para parar
// enquanto a pessoa não está olhando para o app.

interface WindowActivityState {
  activity: WindowActivity
  setActivity: (activity: WindowActivity) => void
}

export const useWindowActivityStore = create<WindowActivityState>((set, get) => ({
  activity: ACTIVE_WINDOW,
  setActivity: (activity) => {
    if (!sameActivity(get().activity, activity)) set({ activity })
  }
}))

/** true com a janela sem foco, minimizada ou na bandeja. */
export const useInBackground = (): boolean =>
  useWindowActivityStore((s) => inBackground(s.activity))
