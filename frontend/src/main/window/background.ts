import { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, Tray } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { probeTrayHost } from './trayHost'
import { badgeBitmap, badgeDescription, badgeLabel } from './taskbarBadge'
import { handleNotify, type NotifyPayload } from './nativeNotify'
import { logNotification } from './toasts'
import {
  closeToTrayEnabled,
  launchedHidden,
  LOGIN_ITEM_ARGS,
  shouldHideOnClose,
  staleLoginItem,
  trayTooltip
} from './windowPolicy'

// Modo segundo plano estilo Discord: bandeja, instância única, iniciar com o
// Windows e notificações nativas. Bandeja no Windows e no Linux (StatusNotifier:
// Waybar, KDE, GNOME com extensão); fechar-esconde sempre no Windows e, no
// Linux, só se a bandeja está funcionando e a opção está ligada.

interface CallState {
  inCall: boolean
  muted: boolean
}

let tray: Tray | null = null
let trayWindow: () => BrowserWindow | null = () => null
// "Minimizar para a bandeja ao fechar" (só Linux; no Windows é sempre assim).
let closeToTray = true
let quitting = false
// Mensagens que chegaram com a janela fora de vista (selo na barra de tarefas).
let unseenCount = 0
let callState: CallState = { inCall: false, muted: false }
const callStateListeners = new Set<(state: CallState) => void>()

export function isInCall(): boolean {
  return callState.inCall
}

export function onCallStateChange(listener: (state: CallState) => void): void {
  callStateListeners.add(listener)
}

/** Daqui em diante fechar a janela fecha o app (ex.: instalar atualização). */
export function markQuitting(value = true): void {
  quitting = value
}

const prefsPath = (): string => join(app.getPath('userData'), 'background.json')

interface Prefs {
  autostartInitialized?: boolean
  closeToTray?: boolean
}

function readPrefs(): Prefs {
  try {
    return JSON.parse(readFileSync(prefsPath(), 'utf8'))
  } catch {
    return {}
  }
}

function writePrefs(prefs: Prefs): void {
  try {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(prefsPath(), JSON.stringify(prefs))
  } catch {
    // sem onde gravar: só repete a configuração inicial no próximo boot
  }
}

// O portable roda de uma pasta temporária: um atalho de login para ele quebraria.
const autostartSupported = (): boolean =>
  process.platform === 'win32' && !process.env.PORTABLE_EXECUTABLE_FILE

function setAutostart(enabled: boolean): void {
  app.setLoginItemSettings({ openAtLogin: enabled, args: LOGIN_ITEM_ARGS })
}

// Sem os mesmos args da gravação, o Windows sempre responde openAtLogin false.
const loginItemSettings = (): Electron.LoginItemSettings =>
  app.getLoginItemSettings({ args: LOGIN_ITEM_ARGS })

/** Atalho de login ainda no Concord.exe (nome antigo): regrava no .exe atual. */
function repairAutostart(): void {
  const { openAtLogin, launchItems = [] } = loginItemSettings()
  if (openAtLogin) return
  const stale = staleLoginItem(launchItems, process.execPath)
  if (stale)
    app.setLoginItemSettings({ openAtLogin: true, args: LOGIN_ITEM_ARGS, enabled: stale.enabled })
}

/** "Iniciar com o Windows" vem ligado na primeira execução. */
function initAutostart(): void {
  if (!autostartSupported() || !app.isPackaged) return
  repairAutostart()
  const prefs = readPrefs()
  if (prefs.autostartInitialized) return
  setAutostart(true)
  writePrefs({ ...prefs, autostartInitialized: true })
}

/** Selo vermelho com o número de não lidas sobre o ícone da barra de tarefas. */
function updateTaskbarBadge(win: BrowserWindow): void {
  // Na bandeja (Windows e Linux) o número de não lidas vai na dica do ícone.
  refreshTray()
  if (process.platform !== 'win32' || win.isDestroyed()) return
  const label = badgeLabel(unseenCount)
  if (!label) {
    win.setOverlayIcon(null, '')
    return
  }
  const size = 32
  const image = nativeImage.createFromBitmap(badgeBitmap(label, size), {
    width: size,
    height: size,
    scaleFactor: 2
  })
  win.setOverlayIcon(image, badgeDescription(unseenCount))
}

function showWindow(win: BrowserWindow | null): void {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

const refreshTray = (): void => rebuildTrayMenu(trayWindow)

function rebuildTrayMenu(getWindow: () => BrowserWindow | null): void {
  if (!tray || tray.isDestroyed()) return
  tray.setToolTip(trayTooltip(callState.inCall, unseenCount))
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir a Salinha', click: () => showWindow(getWindow()) },
      ...(callState.inCall
        ? [
            {
              label: callState.muted ? 'Ativar microfone' : 'Silenciar microfone',
              click: () => getWindow()?.webContents.send('tray:toggle-mute')
            }
          ]
        : []),
      { type: 'separator' as const },
      { label: 'Sair da Salinha', click: () => requestQuit(getWindow()) }
    ])
  )
}

/** Sair de verdade: o renderer encerra a chamada antes de o app fechar. */
function requestQuit(win: BrowserWindow | null): void {
  quitting = true
  if (!win || win.isDestroyed()) {
    app.quit()
    return
  }
  win.webContents.send('app:quit-requested')
  // Se o renderer não responder (travado), fecha mesmo assim.
  setTimeout(() => app.quit(), 1500)
}

/**
 * Garante uma única instância. Retorna false se já havia outra aberta (esta
 * deve encerrar); a outra recebe o foco e os args dela (ex.: o link
 * salinha://convite/… que abriu o app de novo).
 */
export function ensureSingleInstance(
  getWindow: () => BrowserWindow | null,
  onSecondInstance?: (argv: string[]) => void
): boolean {
  if (!app.requestSingleInstanceLock()) return false
  app.on('second-instance', (_event, argv) => {
    onSecondInstance?.(argv)
    showWindow(getWindow())
  })
  return true
}

/** Deve a janela começar escondida (aberta pelo login do Windows)? */
export function startHidden(): boolean {
  return autostartSupported() && launchedHidden(process.argv)
}

/** Ícones pequenos da bandeja do Linux (PNG 32 px e 64 px para telas HiDPI). */
export interface TrayIcons {
  small: string
  large: string
}

/**
 * Ícone da bandeja no Linux: o painel recebe o PNG pronto por D-Bus e o
 * redimensiona; mandar os 512 px do ícone do app ficaria serrilhado.
 */
function linuxTrayImage(icons?: TrayIcons): Electron.NativeImage | null {
  if (!icons) return null
  try {
    const image = nativeImage.createEmpty()
    image.addRepresentation({ scaleFactor: 1, buffer: readFileSync(icons.small) })
    image.addRepresentation({ scaleFactor: 2, buffer: readFileSync(icons.large) })
    return image.isEmpty() ? null : image
  } catch {
    return null
  }
}

function createTray(image: Electron.NativeImage, getWindow: () => BrowserWindow | null): void {
  try {
    tray = new Tray(image)
  } catch (error) {
    // Sem bandeja: no Linux fechar a janela passa a fechar o app.
    tray = null
    logNotification(`bandeja não criada: ${error}`)
    return
  }
  tray.on('click', () => showWindow(getWindow()))
  rebuildTrayMenu(getWindow)
}

export function setupBackground(
  getWindow: () => BrowserWindow | null,
  icon: string,
  linuxIcons?: TrayIcons
): void {
  initAutostart()

  app.on('before-quit', () => {
    quitting = true
  })

  trayWindow = getWindow
  closeToTray = closeToTrayEnabled(readPrefs().closeToTray)
  if (process.platform === 'win32') {
    createTray(nativeImage.createFromPath(icon), getWindow)
  } else if (process.platform === 'linux') {
    createTray(linuxTrayImage(linuxIcons) ?? nativeImage.createFromPath(icon), getWindow)
  }

  ipcMain.on('call:state', (_e, state: CallState) => {
    callState = state
    rebuildTrayMenu(getWindow)
    callStateListeners.forEach((listener) => listener(state))
  })

  ipcMain.on('app:quit', () => {
    quitting = true
    app.quit()
  })

  ipcMain.handle('settings:autostart', () =>
    autostartSupported() ? loginItemSettings().openAtLogin : null
  )
  ipcMain.handle('settings:set-autostart', (_e, enabled: boolean) => {
    if (!autostartSupported()) return null
    setAutostart(enabled)
    return enabled
  })

  // "Minimizar para a bandeja ao fechar": null fora do Linux ou sem bandeja.
  // `available` = há um painel mostrando ícones agora (senão fechar fecha o app).
  ipcMain.handle('settings:close-to-tray', async () => {
    if (!linuxTrayCreated()) return null
    return { enabled: closeToTray, available: await probeTrayHost() }
  })
  ipcMain.handle('settings:set-close-to-tray', (_e, enabled: boolean) => {
    if (!linuxTrayCreated()) return null
    closeToTray = enabled === true
    writePrefs({ ...readPrefs(), closeToTray })
    return closeToTray
  })

  ipcMain.on('notify', (_e, payload: NotifyPayload) =>
    handleNotify(payload, {
      window: getWindow,
      icon,
      supported: () => Notification.isSupported(),
      createToast: (options) => new Notification(options),
      open: (win, route) => {
        showWindow(win)
        win.webContents.send('navigate', route)
      },
      countUnseen: (win) => {
        unseenCount++
        updateTaskbarBadge(win)
      },
      log: logNotification
    })
  )
}

const linuxTrayCreated = (): boolean =>
  process.platform === 'linux' && tray !== null && !tray.isDestroyed()

/** Liga o "fechar esconde na bandeja" na janela principal. */
export function attachCloseToTray(win: BrowserWindow): void {
  win.on('close', (event) => {
    const trayEnabled = process.platform === 'linux' ? linuxTrayCreated() && closeToTray : true
    // trayWorks: true só para saber se este caso pode esconder; no Linux a
    // bandeja é confirmada no D-Bus logo abaixo, antes de esconder.
    if (!shouldHideOnClose(process.platform, quitting, { trayWorks: true, enabled: trayEnabled }))
      return
    event.preventDefault()
    if (process.platform !== 'linux') {
      win.hide()
      return
    }
    // Linux: só esconde se o painel mostra a bandeja neste instante (ele pode
    // ter fechado ou nunca ter existido). Senão fecha de verdade — a Salinha
    // nunca fica invisível sem ícone para reabrir.
    void probeTrayHost().then((works) => {
      if (win.isDestroyed()) return
      if (shouldHideOnClose('linux', quitting, { trayWorks: works, enabled: trayEnabled })) {
        win.hide()
      } else {
        quitting = true
        win.close()
      }
    })
  })
  // Voltou a olhar a janela: para de piscar e limpa o selo de não lidas.
  win.on('focus', () => {
    win.flashFrame(false)
    if (unseenCount === 0) return
    unseenCount = 0
    updateTaskbarBadge(win)
  })
}
