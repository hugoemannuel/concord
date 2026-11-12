import { ipcMain, type BrowserWindow } from 'electron'
import { fromWindow } from './ipcGuard'

/**
 * Proteção contra print/gravação da janela (visualização única aberta). O
 * renderer liga ao abrir a mídia e desliga ao fechar. Só a janela principal
 * pode pedir (o overlay carrega o mesmo preload), e só `true` de verdade liga:
 * qualquer outro valor desliga.
 */
export function registerContentProtection(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('window:content-protection', (event, on: unknown): void => {
    const win = getWindow()
    if (!win || win.isDestroyed() || !fromWindow(event, getWindow)) return
    win.setContentProtection(on === true)
  })
}
