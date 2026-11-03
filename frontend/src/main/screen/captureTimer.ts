// Janela do app totalmente coberta (jogo em tela cheia, por exemplo): o Windows 11
// pode ignorar o temporizador fino do processo, e a captura de tela cai para 32 fps
// (dois tiques de 15,625 ms), em qualquer resolução. O helper nativo pede ao
// Windows para manter o temporizador. Sem ele a live segue como antes. Ver
// docs/adr/0050.

interface HelperProcess {
  on(event: 'error', listener: (error: Error) => void): unknown
  on(event: 'exit', listener: (code: number | null) => void): unknown
}

export interface CaptureTimerDeps {
  platform: NodeJS.Platform
  helper: string
  pid: number
  exists: (path: string) => boolean
  run: (path: string, args: string[]) => HelperProcess
  log: (message: string) => void
}

export function keepCaptureTimer(d: CaptureTimerDeps): void {
  if (d.platform !== 'win32' || !d.exists(d.helper)) return
  const child = d.run(d.helper, ['keep-timer', String(d.pid)])
  child.on('error', (error) => d.log(`keep-timer falhou: ${error.message}`))
  child.on('exit', (code) => {
    if (code !== 0) d.log(`keep-timer saiu com ${code}`)
  })
}
