import type { ChildProcess } from 'child_process'
import { createInterface } from 'readline'
import type { AvatarStore } from './overlayAvatars'
import type { OverlayHost, OverlaySurface } from './overlaySurface'
import { nativeStateLine, parseNativeOverlayEvent } from './nativeOverlayProtocol'
import type { Foreground } from './overlayPolicy'
import { reportHelperExit } from '../errorReport/mainErrors'

// Overlay desenhado pelo helper nativo (`concord-audio.exe overlay`): uma
// janela Win32 em camada com Direct2D, sem Chromium por cima do jogo. O estado
// vai por stdin (uma linha JSON quando muda) e a posição nova do arraste volta
// por stdout. Se o helper não sobe, não responde ou sai, avisa o controlador
// (host.failed), que cai na janela do Electron.

/** Tempo para o helper criar a janela e dizer "ready". */
export const NATIVE_READY_TIMEOUT_MS = 5000

export interface NativeOverlayDeps {
  /** Sobe `concord-audio.exe overlay` com stdin/stdout em pipe. */
  start: () => ChildProcess
  avatars: AvatarStore
  log: (message: string) => void
}

export function createNativeOverlay(host: OverlayHost, deps: NativeOverlayDeps): OverlaySurface {
  const child = deps.start()
  let ready = false
  let done = false
  let visible = false
  let editing = false
  let foreground: Foreground = null
  let lastLine: string | null = null

  const fail = (reason: string): void => {
    if (done) return
    done = true
    clearTimeout(timer)
    deps.avatars.onChange(null)
    child.kill()
    host.failed(reason)
  }
  const timer = setTimeout(() => {
    if (!ready) fail('o helper não respondeu')
  }, NATIVE_READY_TIMEOUT_MS)

  const push = (): void => {
    if (done || !child.stdin) return
    const line = nativeStateLine({
      snapshot: host.snapshot(),
      foreground,
      visible,
      editing,
      avatarPath: deps.avatars.path
    })
    if (line === lastLine) return
    lastLine = line
    child.stdin.write(line + '\n')
  }

  child.on('error', (err) => fail(`não iniciou: ${err.message}`))
  child.on('exit', (code, signal) => {
    // done = o fim foi pedido (destroy) ou já tratado (sem resposta a tempo).
    if (!done) reportHelperExit('concord-overlay', code, signal)
    fail(`saiu (código ${code})`)
  })
  // Pipe fechado no meio de uma escrita: o 'exit' explica o resto.
  child.stdin?.on('error', () => {})
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (text: string) => deps.log(`overlay nativo: ${text.trim()}`))
  if (child.stdout) {
    createInterface({ input: child.stdout }).on('line', (line) => {
      const event = parseNativeOverlayEvent(line)
      if (!event || done) return
      if (event.type === 'ready') {
        ready = true
        clearTimeout(timer)
        deps.log('overlay: janela nativa pronta')
      } else if (event.type === 'layout') {
        host.saveLayout(event.layout)
      } else {
        deps.log(`overlay nativo: ${event.message}`)
      }
    })
  }
  // Avatar baixado: manda o caminho dele.
  deps.avatars.onChange(push)

  return {
    onState: () => {},
    show: (next) => {
      foreground = next
      visible = true
      push()
    },
    hide: () => {
      visible = false
      push()
    },
    setEditing: (next) => {
      editing = next
      push()
    },
    canEdit: () => ready && !done,
    destroy: () => {
      if (done) return
      done = true
      clearTimeout(timer)
      deps.avatars.onChange(null)
      // stdin fechado = o helper sai sozinho; o kill garante.
      child.stdin?.end()
      child.kill()
    }
  }
}
