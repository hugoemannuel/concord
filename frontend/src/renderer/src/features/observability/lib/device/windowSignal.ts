import { useWindowActivityStore } from '../../../../shared/store/windowActivityStore'

// "Visível" e "com foco" para a telemetria do aparelho (docs/adr/0069), pelo
// estado da janela do app: no desktop o main avisa (em call ele desliga o
// backgroundThrottling e a Page Visibility diz "visível" sempre, mesmo
// minimizada); no web, o próprio navegador (WindowActivityBridge).

const activity = () => useWindowActivityStore.getState().activity

/** Não minimizada nem na bandeja (sem foco, atrás do jogo, ainda é visível). */
export const windowVisible = (): boolean => activity().visible

/** Com o foco do teclado e aparecendo. */
export const windowFocused = (): boolean => activity().visible && activity().focused

/** Chama onChange a cada mudança do estado da janela; devolve o "desligar". */
export function watchWindowActivity(onChange: () => void): () => void {
  return useWindowActivityStore.subscribe(onChange)
}
