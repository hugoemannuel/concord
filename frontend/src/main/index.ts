import {
  app,
  shell,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  ipcMain,
  Menu,
  session,
  type MenuItemConstructorOptions
} from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { displayAudioMode } from './displayMedia'
import { PendingDisplayRequest } from './displayPicker'
import { attachCloseToTray, ensureSingleInstance, setupBackground, startHidden } from './background'
import { setupUpdater } from './updater'
import { setupOverlay } from './overlay'
import { setupGlobalKeybinds } from './globalKeybinds'
import { setupGames } from './games'
import { setupAppMetrics } from './appMetrics'
import { handleInviteArgs, setupInviteProtocol } from './inviteProtocol'
import { closeActivity, setupActivities } from './activityWindow'
import { APP_USER_MODEL_ID } from './toastPolicy'
import { setupToasts } from './toasts'
import { TITLE_BAR_COLOR, titleBarOptions } from './windowPolicy'
import { isSafeExternalUrl } from '../shared/externalUrl'
import { contextMenuItems } from './contextMenu'
import { bootServer, serveRendererCsp, setupServerSwitch, type BootServer } from './serverSwitch'
import { updateFeedUrl } from './serverConfig'
import { setupHostServer } from './hostSetup'
import { SERVER_ARG } from '../shared/serverAddress'
import {
  audioLogPath,
  hwndFromSourceId,
  logAudio,
  registerScreenAudio,
  startWindowAudio,
  stopWindowAudio
} from './screenAudio'

let mainWindow: BrowserWindow | null = null
/** Servidor desta execução: embutido no build ou escolhido na tela inicial. */
let server: BootServer = { url: null, fixed: false }

// Picker de tela (Fase 3): o getDisplayMedia do renderer dispara este handler,
// que pede ao renderer para abrir o modal de seleção e resolve com a fonte
// escolhida via IPC (estilo Discord).
const pendingDisplay = new PendingDisplayRequest((err) =>
  logAudio(`recusar o compartilhamento falhou: ${String(err)}`)
)
let pendingAudioRequested = false

const WINDOW_WATCH_MS = 2000
let windowWatch: NodeJS.Timeout | null = null

function stopWindowWatch(): void {
  if (windowWatch) clearInterval(windowWatch)
  windowWatch = null
}

// Janela minimizada some da lista de janelas e o Windows para de gerar imagem
// dela: quem assiste vê a live congelar. Avisa quem compartilha, uma vez por
// minimização.
function watchSharedWindow(sourceId: string): void {
  stopWindowWatch()
  let hidden = false
  windowWatch = setInterval(async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: 0, height: 0 }
      })
      const missing = !sources.some((s) => s.id === sourceId)
      if (missing && !hidden) mainWindow?.webContents.send('screen-share:window-hidden')
      hidden = missing
    } catch {
      /* próxima volta tenta de novo */
    }
  }, WINDOW_WATCH_MS)
}

function registerScreenShareHandlers(): void {
  ipcMain.on('screen-share:ended', stopWindowWatch)

  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    pendingDisplay.hold(callback)
    pendingAudioRequested = request.audioRequested
    mainWindow?.webContents.send('screen-picker:show')
  })

  ipcMain.handle('screen-picker:sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 480, height: 270 },
      fetchWindowIcons: true
    })
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
      appIcon: source.appIcon?.toDataURL() ?? null,
      displayId: source.display_id
    }))
  })

  ipcMain.on('screen-picker:select', async (_event, sourceId: string) => {
    const callback = pendingDisplay.take()
    if (!callback) return
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] })
      const source = sources.find((s) => s.id === sourceId)
      // Cada escolha começa do zero: nada do compartilhamento anterior.
      stopWindowAudio()
      if (!source) {
        logAudio(`fonte ${sourceId} não encontrada`)
        callback(null)
        return
      }
      const hwnd = hwndFromSourceId(source.id)
      let windowAudioOk = false
      if (hwnd && pendingAudioRequested && process.platform === 'win32' && mainWindow) {
        windowAudioOk = await startWindowAudio(hwnd, mainWindow.webContents)
      }
      const mode = displayAudioMode({
        sourceId: source.id,
        audioRequested: pendingAudioRequested,
        platform: process.platform,
        windowAudioOk
      })
      logAudio(`compartilhando "${source.name}" (${source.id}): som = ${mode}`)
      if (mode === 'none' && source.id.startsWith('window:') && pendingAudioRequested) {
        mainWindow?.webContents.send('screen-audio:fallback', audioLogPath())
      }
      if (source.id.startsWith('window:')) watchSharedWindow(source.id)
      else stopWindowWatch()
      callback(mode === 'system' ? { video: source, audio: 'loopback' } : { video: source })
    } catch (err) {
      logAudio(`falha ao compartilhar ${sourceId}: ${String(err)}`)
      callback(null)
    }
  })

  ipcMain.on('screen-picker:cancel', () => {
    stopWindowAudio()
    pendingDisplay.deny()
  })
}

// Janela coberta/minimizada não pode ser tratada como oculta: o Windows marca
// como "ocluída" e o Chromium para de renderizar (a captura congela).
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
// Captura de janela/tela via Windows Graphics Capture: continua entregando
// quadros de uma janela coberta por outra (o capturador GDI antigo congela).
app.commandLine.appendSwitch('enable-features', 'AllowWgcWindowCapturer,AllowWgcScreenCapturer')

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'Salinha',
    backgroundColor: TITLE_BAR_COLOR,
    ...titleBarOptions(process.platform),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // O preload entrega ao renderer antes do config.ts rodar (sem servidor:
      // tela inicial).
      additionalArguments: server.url ? [`${SERVER_ARG}${server.url}`] : [],
      sandbox: false,
      // Sem isso o Chromium reduz timers/render da janela em segundo plano e a
      // live (captura de tela/WebRTC) trava para quem assiste.
      backgroundThrottling: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    // Aberto pelo "Iniciar com o Windows": fica só na bandeja.
    if (!startHidden()) mainWindow?.show()
  })
  attachCloseToTray(mainWindow)

  mainWindow.on('closed', () => {
    pendingDisplay.deny()
    closeActivity()
    mainWindow = null
  })

  // Link do chat (target="_blank") abre no navegador de fora. Só http/https:
  // o openExternal abriria qualquer esquema (file:, smb:, ms-settings:…).
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isSafeExternalUrl(details.url)) void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Botão direito: copiar seleção, copiar/abrir link e editar campos de texto
  // (o Electron não tem menu padrão). Onde o app abre o próprio menu, o
  // renderer cancela o contextmenu e este evento não vem.
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const template: MenuItemConstructorOptions[] = contextMenuItems(params).map((item) => {
      if ('type' in item) return { type: 'separator' }
      if ('role' in item)
        return { label: item.label, role: item.role, enabled: item.enabled ?? true }
      const { url } = item
      return {
        label: item.label,
        click: () => {
          if (item.action === 'copyLink') clipboard.writeText(url)
          else if (isSafeExternalUrl(url)) void shell.openExternal(url)
        }
      }
    })
    if (template.length > 0 && mainWindow)
      Menu.buildFromTemplate(template).popup({ window: mainWindow })
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
// Só uma instância: abrir de novo traz a janela existente.
// app.exit (não quit): sai na hora, sem criar janela/bandeja duplicadas.
// O app se chamava Concord: a pasta de dados continua a mesma para ninguém
// perder o login nem as configurações (antes do lock, que mora nela).
app.setPath('userData', join(app.getPath('appData'), 'Concord'))
if (
  !ensureSingleInstance(
    () => mainWindow,
    (argv) => handleInviteArgs(argv, () => mainWindow)
  )
) {
  app.exit(0)
} else {
  // Link salinha://convite/<código>: registra o protocolo e guarda o convite
  // que abriu o app (o renderer busca quando carregar).
  setupInviteProtocol(() => mainWindow)
}

app.whenReady().then(() => {
  // Set app user model id for windows. Mantém o id do Concord (nome antigo):
  // é o que liga notificações, atalho de login e instalação ao mesmo app.
  electronApp.setAppUserModelId(APP_USER_MODEL_ID)
  // Antes de qualquer notificação: CLSID fixo e atalho do Menu Iniciar.
  setupToasts()
  // Sem a barra "File Edit View Window" padrão do Electron (aparecia no Alt).
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null)

  // Dev = renderer servido pelo Vite (yarn dev); o build rodando sem empacotar
  // (electron-vite preview) se comporta como o instalado.
  server = bootServer(is.dev && Boolean(process.env['ELECTRON_RENDERER_URL']))
  // Build genérico: a CSP do index.html é preenchida com o servidor escolhido.
  if (!server.fixed) serveRendererCsp(join(__dirname, '../renderer/index.html'), server.url)
  setupServerSwitch(() => mainWindow, server)
  setupHostServer(() => mainWindow)

  registerScreenShareHandlers()
  registerScreenAudio()
  setupBackground(() => mainWindow, icon)
  setupOverlay(() => mainWindow)
  setupGlobalKeybinds(() => mainWindow)
  setupActivities(() => mainWindow)
  setupGames(() => mainWindow)
  setupAppMetrics(() => mainWindow)
  setupUpdater(() => mainWindow, {
    feedUrl: updateFeedUrl(server.url),
    publicKeyPem: __CONCORD_UPDATE_PUBKEY__
  })

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
