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
import trayIcon from '../../resources/tray.png?asset'
import trayIcon2x from '../../resources/tray-2x.png?asset'
import './screen/captureSwitches'
import { PendingDisplayRequest } from './screen/displayPicker'
import { shareStreams, type ShareDeps } from './screen/shareSource'
import { WindowWatch } from './screen/windowWatch'
import { PreferredSource, findGameWindow, listProcessWindows } from './screen/gameWindow'
import { checkScreenCastPortal } from './screen/screenPortal'
import { portalMissingMessage, screenFlowArgs, screenShareFlow } from '../shared/screenShareFlow'
import { enforceSandbox, SANDBOXED_PREFERENCES } from './security/sandbox'
import { appOrigins, setupSessionPermissions } from './security/sessionPermissions'
import {
  attachCloseToTray,
  ensureSingleInstance,
  isInCall,
  onCallStateChange,
  setupBackground,
  startHidden
} from './window/background'
import { watchWindowActivity } from './window/windowActivity'
import { setupWindowDrag } from './window/windowDrag'
import { setupUpdater } from './updates/updater'
import { updateFeedFor } from './server/serverChoice'
import { registerServerDiagnostics, startServerChoice } from './server/serverSetup'
import { serverArgs } from '../shared/serverConnection'
import { setupOverlay } from './overlay/overlay'
import { setupGlobalKeybinds } from './overlay/globalKeybinds'
import { setupGames } from './activity/games'
import { setupMusic } from './activity/music'
import { setupAppMetrics } from './app/appMetrics'
import { setupTTS } from './tts/ttsSetup'
import { setupPerfLog } from './perf/setupPerfLog'
import { handleInviteArgs, handleInviteUrl, setupInviteProtocol } from './app/inviteProtocol'
import { closeActivity, setupActivities } from './activity/activityWindow'
import { APP_USER_MODEL_ID } from './window/toastPolicy'
import { setupToasts } from './window/toasts'
import { TITLE_BAR_COLOR, titleBarOptions } from './window/windowPolicy'
import { registerThemeHandlers } from './window/titleBarTheme'
import { isSafeExternalUrl } from '../shared/externalUrl'
import { fromWindow, parseSourceId } from './window/ipcGuard'
import { guardNavigation } from './window/navigationGuard'
import { contextMenuItems } from './window/contextMenu'
import {
  audioLogPath,
  logAudio,
  registerScreenAudio,
  startWindowAudio,
  stopWindowAudio
} from './screen/screenAudio'
import { setupNativeLive } from './nativeLive/setupNativeLive'
import { openSplash } from './splash/openSplash'
import { takeHiddenRelaunch } from './splash/splashMarks'

let mainWindow: BrowserWindow | null = null
/** Endereço do servidor que respondeu ao abrir (undefined no dev: o do build). */
let serverUrl: string | undefined
/** Wayland usa o seletor do sistema; o preload (em sandbox) recebe por argumento. */
const screenFlow = screenShareFlow(process.platform, process.env)
/** Aberto pelo login do sistema (ou reaberto pela instalação dele): fica na bandeja. */
let launchHidden = false
/** Servidor do Vite no dev (só lá): a única origem http liberada além dos servidores do build. */
const devRendererUrl = is.dev ? process.env['ELECTRON_RENDERER_URL'] : undefined

// Picker de tela (Fase 3): o getDisplayMedia do renderer dispara este handler,
// que pede ao renderer para abrir o modal de seleção e resolve com a fonte
// escolhida via IPC (estilo Discord).
const pendingDisplay = new PendingDisplayRequest((err) =>
  logAudio(`recusar o compartilhamento falhou: ${String(err)}`)
)
let pendingAudioRequested = false
// Janela do jogo em atividade escolhida pelo card (pula o modal de seleção).
const preferredSource = new PreferredSource()
const captureDeps = {
  windows: () =>
    desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } }),
  hwnds: listProcessWindows
}

const windowWatch = new WindowWatch(
  async () => (await captureDeps.windows()).map((s) => s.id),
  () => mainWindow?.webContents.send('screen-share:window-hidden')
)

function registerScreenShareHandlers(): void {
  ipcMain.on('screen-share:ended', () => windowWatch.stop())

  // Wayland: o seletor é o do sistema (xdg-desktop-portal). Cada getSources
  // abre o seletor e devolve só a fonte escolhida, com id novo a cada vez —
  // por isso não dá para listar no modal do app e depois procurar pelo id.
  const flow = screenFlow

  // O renderer pergunta antes de abrir o seletor: sem o portal, o getSources
  // falha igual a um "Cancelar" e ninguém saberia o motivo.
  ipcMain.handle('screen-share:portal-status', async () => {
    const status = flow === 'portal' ? await checkScreenCastPortal() : 'available'
    if (status === 'missing') logAudio('portal: sem a interface ScreenCast do xdg-desktop-portal')
    return { status, message: portalMissingMessage(process.env.XDG_CURRENT_DESKTOP) }
  })

  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    pendingDisplay.hold(callback)
    pendingAudioRequested = request.audioRequested
    if (flow === 'portal') {
      windowWatch.stop()
      void shareFromPortal()
      return
    }
    const preferred = preferredSource.take()
    if (preferred) void shareSource(preferred)
    else mainWindow?.webContents.send('screen-picker:show')
  })

  // Card do jogo: acha a janela dele; se achar, o próximo getDisplayMedia a usa.
  ipcMain.handle('screen-share:prefer-game', async (_event, gameName: unknown) => {
    preferredSource.clear()
    const id = flow === 'app' ? await findGameWindow(gameName, captureDeps) : null
    if (id) preferredSource.set(id)
    return id
  })

  // O som não vai junto no Linux (o loopback do Electron é só do Windows).
  let portalRequest = 0
  async function shareFromPortal(): Promise<void> {
    const ticket = ++portalRequest
    let source: Electron.DesktopCapturerSource | undefined
    try {
      // Tela e janela: o portal oferece as duas (vem como "window:" qualquer
      // que seja a escolha). Sem miniatura: ninguém vai ver.
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 0, height: 0 }
      })
      source = sources[0]
    } catch (err) {
      // Cancelou o seletor do sistema (ou o portal falhou).
      logAudio(`portal: sem fonte (${String(err)})`)
    }
    // Um pedido mais novo chegou enquanto o seletor estava aberto: ele responde.
    if (ticket !== portalRequest) return
    const callback = pendingDisplay.take()
    if (!callback) return
    if (!source) {
      callback(null)
      return
    }
    logAudio(`compartilhando pelo portal (${source.id}): som = none`)
    callback({ video: source })
  }

  // Só lista e escolhe com um getDisplayMedia pendente e pela janela principal:
  // sem isso, um XSS tiraria miniaturas da área de trabalho a qualquer hora.
  const pickerAllowed = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): boolean =>
    pendingDisplay.pending() && fromWindow(event, () => mainWindow)

  ipcMain.handle('screen-picker:sources', async (event) => {
    if (!pickerAllowed(event)) return []
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

  // Responde o getDisplayMedia pendente com a fonte escolhida (modal ou atalho do jogo).
  async function shareSource(sourceId: string): Promise<void> {
    const callback = pendingDisplay.take()
    if (!callback) return
    callback(await shareStreams(sourceId, shareDeps()))
  }

  const shareDeps = (): ShareDeps => ({
    listSources: () => desktopCapturer.getSources({ types: ['screen', 'window'] }),
    stopWindowAudio,
    startWindowAudio: (hwnd) =>
      mainWindow ? startWindowAudio(hwnd, mainWindow.webContents) : Promise.resolve(false),
    watchWindow: (id) => windowWatch.watch(id),
    stopWatch: () => windowWatch.stop(),
    warnAudioFallback: () =>
      mainWindow?.webContents.send('screen-audio:fallback', audioLogPath()),
    log: logAudio,
    audioRequested: pendingAudioRequested,
    platform: process.platform
  })

  ipcMain.on('screen-picker:select', (event, raw: unknown) => {
    const sourceId = parseSourceId(raw)
    if (sourceId && pickerAllowed(event)) void shareSource(sourceId)
  })

  ipcMain.on('screen-picker:cancel', (event) => {
    if (!fromWindow(event, () => mainWindow)) return
    stopWindowAudio()
    pendingDisplay.deny()
  })
}

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
      ...SANDBOXED_PREFERENCES,
      preload: join(__dirname, '../preload/index.js'),
      // Em chamada o throttling de segundo plano fica desligado (a live travaria
      // para quem assiste); fora dela, ligado. Quem decide é o watchWindowActivity.
      backgroundThrottling: false,
      additionalArguments: [...serverArgs(serverUrl), ...screenFlowArgs(screenFlow)]
    }
  })

  mainWindow.on('ready-to-show', () => {
    // Aberto pelo "Iniciar com o Windows": fica só na bandeja.
    if (!launchHidden) mainWindow?.show()
  })
  attachCloseToTray(mainWindow)
  watchWindowActivity(mainWindow, { inCall: isInCall, onCallStateChange })

  mainWindow.on('closed', () => {
    pendingDisplay.deny()
    closeActivity()
    mainWindow = null
  })

  // Link do chat (target="_blank") abre no navegador de fora. Só http/https:
  // o openExternal abriria qualquer esquema (file:, smb:, ms-settings:…).
  // Link de convite nosso abre a confirmação aqui mesmo, não o navegador.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (handleInviteUrl(details.url, () => mainWindow)) return { action: 'deny' }
    if (isSafeExternalUrl(details.url)) void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  guardNavigation(mainWindow.webContents, (url) => {
    if (handleInviteUrl(url, () => mainWindow)) return
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
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
          else if (handleInviteUrl(url, () => mainWindow)) return
          else if (isSafeExternalUrl(url)) void shell.openExternal(url)
        }
      }
    })
    if (template.length > 0 && mainWindow)
      Menu.buildFromTemplate(template).popup({ window: mainWindow })
  })

  loadRenderer(mainWindow)
}

// HMR for renderer base on electron-vite cli.
// Load the remote URL for development or the local html file for production.
function loadRenderer(win: BrowserWindow): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
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
enforceSandbox(app)
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
  // Primeiro de tudo: o tempo de abertura medido começa daqui. Sem --perf-log não faz nada.
  setupPerfLog(() => mainWindow)
  // A janelinha de abertura aparece já: atualiza (se houver) antes de abrir.
  launchHidden = startHidden() || takeHiddenRelaunch()
  const splash = openSplash(launchHidden, icon)
  // Testa os endereços do servidor enquanto o resto inicia.
  const serverChoice = startServerChoice(__CONCORD_SERVER_URLS__)
  registerServerDiagnostics(serverChoice, __CONCORD_SERVER_URLS__)
  // Set app user model id for windows. Mantém o id do Concord (nome antigo):
  // é o que liga notificações, atalho de login e instalação ao mesmo app.
  electronApp.setAppUserModelId(APP_USER_MODEL_ID)
  // Antes de qualquer notificação: CLSID fixo e atalho do Menu Iniciar.
  setupToasts()
  // Câmera, microfone, notificação...: só o próprio app e só o que ele usa.
  const origins = appOrigins(join(__dirname, '../renderer'), devRendererUrl, __CONCORD_SERVER_URLS__)
  setupSessionPermissions(app, session.defaultSession, origins)
  // Sem a barra "File Edit View Window" padrão do Electron (aparecia no Alt).
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null)

  registerScreenShareHandlers()
  registerThemeHandlers(() => mainWindow)
  registerScreenAudio()
  setupNativeLive()
  setupBackground(() => mainWindow, icon, { small: trayIcon, large: trayIcon2x })
  setupWindowDrag(() => mainWindow)
  setupOverlay(() => mainWindow)
  setupGlobalKeybinds(() => mainWindow)
  setupActivities(() => mainWindow)
  setupGames(() => mainWindow)
  setupMusic(() => mainWindow)
  setupAppMetrics(() => mainWindow)
  setupTTS(() => mainWindow)

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // A janela abre já com o endereço que responde (o principal ou um
  // alternativo, se o principal estiver bloqueado na rede de quem usa).
  void serverChoice.then(async (choice) => {
    serverUrl = choice?.url
    const startupUpdate = setupUpdater(() => mainWindow, {
      feedUrl: updateFeedFor(__CONCORD_UPDATE_URL__, serverUrl),
      publicKeyPem: __CONCORD_UPDATE_PUBKEY__
    })
    await splash.update(startupUpdate)
    createWindow()
    if (mainWindow) splash.handOff(mainWindow)
  })

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
