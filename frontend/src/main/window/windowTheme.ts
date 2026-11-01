import { ipcMain, type BrowserWindow } from 'electron'
import { parseTitleBarColors, TITLE_BAR_HEIGHT } from './windowPolicy'

/** Tema trocou no renderer: a barra de título nativa acompanha (Windows/Linux). */
export function registerThemeHandlers(
  getWindow: () => BrowserWindow | null,
  platform: NodeJS.Platform = process.platform
): void {
  ipcMain.on('window:title-bar-colors', (event, raw: unknown) => {
    const win = getWindow()
    if (!win || event.sender !== win.webContents) return
    const colors = parseTitleBarColors(raw)
    if (!colors) return
    win.setBackgroundColor(colors.color)
    if (platform === 'darwin') return
    try {
      win.setTitleBarOverlay({ ...colors, height: TITLE_BAR_HEIGHT })
    } catch {
      // Sem overlay nativo nesta plataforma/versão: só a faixa do renderer muda.
    }
  })
}
