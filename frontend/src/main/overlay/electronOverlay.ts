import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import {
  normalizeOverlayLayout,
  settleOverlayDraft,
  shownOverlayLayout,
  type OverlayDraft,
  type OverlayLayout,
  type OverlaySize
} from '../../renderer/src/features/overlay/lib/overlayLayout'
import { appendLog } from '../app/appLog'
import { overlayFrame, overlayWindowRect, type OverlayFrame, type Rect } from './overlayPolicy'
import type { OverlayHost, OverlaySurface } from './overlaySurface'
import { guardNavigation } from '../window/navigationGuard'

// Overlay desenhado por uma janela do Electron: transparente, click-through e
// sem foco por cima do jogo em tela cheia em janela (nada é injetado no jogo).
//
// A lista é uma caixa posicionada pelo CSS dentro da área de trabalho do
// monitor do jogo. A janela fica só em volta dela (a página mede e avisa o
// tamanho) e cresce para a área inteira só no modo de edição, quando passa a
// aceitar o mouse para arrastar/redimensionar a caixa. Continua sem foco
// (focusable: false = WS_EX_NOACTIVATE no Windows: recebe clique e arraste sem
// tirar o foco do jogo). Jogos que leem o mouse por Raw Input continuam
// recebendo movimento e cliques mesmo com a janela por cima.

let host: OverlayHost
let win: BrowserWindow | null = null
let editing = false
// A página do overlay desta janela já carregou e ouve 'overlay:editing'. Antes
// disso o atalho não liga a edição: seria uma tela inteira pegando cliques sem
// moldura nem dica.
let pageReady = false
// Área de trabalho do monitor do jogo (DIP), tamanho da lista medido pela página,
// último arraste vindo da página (até o salvo chegar) e o que já foi aplicado.
let workArea: Rect | null = null
let box: OverlaySize | null = null
let pageDraft: OverlayDraft | null = null
let placed: Rect | null = null
// Pid do jogo sobre o qual a janela foi posta no topo; último estado que a página recebeu.
let raisedFor: number | null = null
let lastSent: string | null = null
let frame: OverlayFrame | null = null

function log(message: string): void {
  appendLog('audio.log', `overlay: ${message}`)
}

function createOverlayWindow(): BrowserWindow {
  const overlay = new BrowserWindow({
    show: false,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    type: 'toolbar',
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  // Cliques passam para o jogo; nível acima de janelas em tela cheia.
  overlay.setIgnoreMouseEvents(true)
  overlay.setAlwaysOnTop(true, 'screen-saver')
  // Fora do compartilhamento de tela (quem assiste não vê o overlay).
  overlay.setContentProtection(true)
  overlay.on('closed', () => {
    if (win === overlay) win = null
  })
  // O overlay não tem links: nenhuma navegação para fora (levaria o preload junto).
  guardNavigation(overlay.webContents, () => {})
  // Recarregou (ou navegou): a página nova não sabe da edição. Sai dela e volta o
  // click-through até a página avisar que está pronta.
  overlay.webContents.on('did-start-loading', () => {
    if (win !== overlay) return
    pageReady = false
    box = null
    lastSent = null
    host.stopEditing()
    placeWindow()
  })
  // Página que não carrega deixa uma janela transparente vazia: ao menos fica no log.
  overlay.webContents.on('did-fail-load', (_event, code: number, description: string, url: string) =>
    log(`página não carregou (${code} ${description}): ${url}`)
  )
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    overlay.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/overlay.html`)
  } else {
    overlay.loadFile(join(__dirname, '../renderer/overlay.html'))
  }
  return overlay
}

function savedLayout(): OverlayLayout {
  return normalizeOverlayLayout(host.snapshot()?.layout)
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

/**
 * Janela no lugar da lista (ou na área inteira, editando). Só mexe quando o
 * retângulo muda: o estado chega a cada fala, e cada setBounds custa um
 * SetWindowPos e um relayout da página.
 */
function placeWindow(): void {
  if (!win || !workArea) return
  const rect = overlayWindowRect(
    workArea,
    shownOverlayLayout(savedLayout(), pageDraft),
    box,
    editing
  )
  if (!placed || !sameRect(placed, rect)) {
    win.setBounds(rect)
    // Monitores com escalas diferentes: o primeiro setBounds pode sair com a
    // escala do monitor antigo; o segundo acerta.
    const got = win.getBounds()
    if (got && !sameRect(got, rect)) win.setBounds(rect)
    placed = rect
  }
  const next = overlayFrame(workArea, rect)
  if (
    !frame ||
    frame.area.width !== next.area.width ||
    frame.area.height !== next.area.height ||
    frame.origin.x !== next.origin.x ||
    frame.origin.y !== next.origin.y
  ) {
    frame = next
    win.webContents.send('overlay:frame', next)
  }
}

/**
 * Liga/desliga o modo de edição: fora dele, a janela sempre ignora o mouse.
 * Entrando, a janela cresce antes de pegar o mouse; saindo, solta o mouse antes
 * de encolher.
 */
function setEditing(next: boolean): void {
  if (editing === next) return
  editing = next
  if (!next) win?.setIgnoreMouseEvents(true)
  placeWindow()
  if (win) {
    if (next) win.setIgnoreMouseEvents(false)
    win.webContents.send('overlay:editing', next)
  }
}

/**
 * Mostra a janela e a põe acima do jogo. O estado chega a cada fala e cada
 * SetWindowPos de z-order faz o DWM reordenar a janela sobre o jogo (custa FPS):
 * só refaz quando o overlay aparece ou o jogo na frente é outro.
 */
function raiseOverIfNeeded(target: BrowserWindow, pid: number): void {
  if (target.isVisible() && raisedFor === pid) return
  target.setAlwaysOnTop(true, 'screen-saver')
  if (!target.isVisible()) target.showInactive()
  target.moveTop()
  raisedFor = pid
}

/**
 * Manda o estado à página só se ele mudou. Escondida, ela pega o último no
 * `overlay:ready` ou no próximo show.
 */
function pushSnapshot(): void {
  if (!win) return
  const snapshot = host.snapshot()
  const json = JSON.stringify(snapshot ?? null)
  if (json === lastSent) return
  lastSent = json
  win.webContents.send('overlay:update', snapshot)
}

const surface: OverlaySurface = {
  onState: () => {
    pageDraft = settleOverlayDraft(savedLayout(), pageDraft)
  },
  show: (foreground) => {
    if (!win) {
      editing = false
      pageReady = false
      box = null
      placed = null
      frame = null
      lastSent = null
      win = createOverlayWindow()
    }
    // O helper fala em pixels físicos; o Electron posiciona em DIP.
    const display = screen.getDisplayMatching(screen.screenToDipRect(null, foreground.monitor))
    workArea = display.workArea
    placeWindow()
    raiseOverIfNeeded(win, foreground.pid)
    pushSnapshot()
  },
  hide: () => {
    win?.hide()
    raisedFor = null
  },
  setEditing,
  canEdit: () => pageReady,
  destroy: () => {
    // Fora da call (ou desligado): libera o renderer do overlay.
    editing = false
    pageReady = false
    win?.destroy()
    win = null
  }
}

/** Liga os canais da página do overlay; a janela só nasce no primeiro show. */
export function setupElectronOverlay(overlayHost: OverlayHost): OverlaySurface {
  host = overlayHost
  // Página do overlay carregou (já ouvindo os eventos): último estado e se está
  // editando. Só a partir daqui o atalho liga a edição.
  ipcMain.handle('overlay:ready', (event) => {
    if (win && event.sender === win.webContents) pageReady = true
    return { snapshot: host.snapshot(), editing: host.editing(), frame }
  })
  // Página do overlay → tamanho da lista (muda com a escala e com quem entra/sai).
  ipcMain.on('overlay:box', (event, raw: unknown) => {
    if (!win || event.sender !== win.webContents) return
    const size = raw as { width?: unknown; height?: unknown } | null
    const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
    if (!size || !ok(size.width) || !ok(size.height)) return
    box = { width: Math.ceil(size.width), height: Math.ceil(size.height) }
    placeWindow()
  })
  // Página do overlay → posição/tamanho novos (fim do arraste). Quem salva é o
  // renderer principal (preferências do overlay), que manda de volta no estado.
  ipcMain.on('overlay:layout', (event, raw: unknown) => {
    if (!win || event.sender !== win.webContents) return
    const layout = normalizeOverlayLayout(raw)
    // A janela já vai para o lugar novo; o salvo chega depois pelo estado.
    pageDraft = { layout, base: savedLayout() }
    placeWindow()
    host.saveLayout(layout)
  })
  app.on('render-process-gone', (_event, contents) => {
    if (!win || contents !== win.webContents) return
    editing = false
    pageReady = false
    win.destroy()
    win = null
    host.lost()
  })
  return surface
}
