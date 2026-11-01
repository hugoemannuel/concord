import { ipcMain, type BrowserWindow } from 'electron'
import { fromWindow, parsePoint } from './ipcGuard'

export interface DragStart {
  x: number
  y: number
  maximized: boolean
}

/**
 * Arraste manual da barra de título própria (Windows/Linux): substitui o
 * -webkit-app-region: drag nativo do Chromium, que para janela sem moldura
 * (titleBarStyle "hidden" + titleBarOverlay) não cruza para outro monitor —
 * bug conhecido do Electron. O renderer manda a posição calculada a partir
 * do cursor (screenX/screenY); aqui só aplicamos.
 *
 * Desmaximizar é um canal separado (window:drag-restore), pedido pelo
 * renderer só quando o gesto já é um arraste de verdade (passou do limiar em
 * pastDragThreshold) — nunca no início do gesto, senão um clique simples (ou
 * o primeiro clique de um duplo-clique) já restauraria a janela maximizada.
 *
 * Os canais são globais (ipcMain.handle só aceita um handler por canal): por
 * isso recebem um `getWindow`, como setupBackground/setupOverlay, e são
 * ligados uma vez só no app.whenReady — nunca dentro de createWindow, que
 * pode rodar de novo (ex.: "activate" no macOS).
 */
export function setupWindowDrag(getWindow: () => BrowserWindow | null): void {
  const mainWindow = (event: { sender: unknown }): BrowserWindow | null => {
    const win = getWindow()
    return win && !win.isDestroyed() && fromWindow(event, getWindow) ? win : null
  }

  ipcMain.handle('window:drag-start', (event): DragStart | null => {
    const win = mainWindow(event)
    if (!win) return null
    const [x, y] = win.getPosition()
    return { x, y, maximized: win.isMaximized() }
  })

  ipcMain.handle('window:drag-restore', (event): { x: number; y: number } | null => {
    const win = mainWindow(event)
    if (!win) return null
    if (win.isMaximized()) win.unmaximize()
    const [x, y] = win.getPosition()
    return { x, y }
  })

  ipcMain.on('window:drag-move', (event, raw: unknown) => {
    const win = mainWindow(event)
    const point = parsePoint(raw)
    if (win && point) win.setPosition(Math.round(point.x), Math.round(point.y))
  })

  ipcMain.on('window:drag-toggle-maximize', (event) => {
    const win = mainWindow(event)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
}
