import { BrowserWindow, nativeImage } from 'electron'
import type { StartupView } from '../updates/startupFlow'
import { splashHtml, splashScript, wantsSkip, type SplashColors } from './splashPage'
import type { SplashWindow } from './startupSplash'

const WIDTH = 300
const HEIGHT = 340

/**
 * A janelinha de abertura: pequena, sem moldura, sem preload e sem Node, com a
 * página estática de splashPage.ts. Aberta pelo login, aparece sem roubar o
 * foco e fora da barra de tarefas.
 */
export function createSplashWindow(opts: {
  hidden: boolean
  icon: string
  colors: SplashColors
}): SplashWindow {
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    center: true,
    // Escondido (login): só a bandeja aparece. Senão é a única janela do app.
    skipTaskbar: opts.hidden,
    title: 'Salinha',
    backgroundColor: opts.colors.color,
    ...(process.platform === 'linux' ? { icon: opts.icon } : {}),
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })

  // Página estática: não navega para lugar nenhum nem abre janelas.
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  let loaded = false
  let pending: StartupView | null = null
  const render = (view: StartupView): void => {
    if (win.isDestroyed()) return
    void win.webContents.executeJavaScript(splashScript(view)).catch(() => {})
  }
  win.webContents.once('did-finish-load', () => {
    loaded = true
    if (pending) render(pending)
  })
  win.once('ready-to-show', () => {
    if (opts.hidden) win.showInactive()
    else win.show()
  })

  const logo = nativeImage.createFromPath(opts.icon).resize({ width: 192 }).toDataURL()
  const html = splashHtml({ logo, colors: opts.colors })
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

  return {
    show(view) {
      pending = view
      if (loaded) render(view)
    },
    onSkip(listener) {
      win.webContents.on('did-navigate-in-page', (_event, url) => {
        if (wantsSkip(url)) listener()
      })
    },
    close() {
      if (!win.isDestroyed()) win.destroy()
    }
  }
}
