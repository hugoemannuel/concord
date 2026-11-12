import { BrowserWindow, ipcMain } from 'electron'

/**
 * Proteção contra print/gravação da janela (visualização única aberta). O
 * renderer liga ao abrir a mídia e desliga ao fechar; vale só para a janela de
 * quem pediu, e só `true` de verdade liga (qualquer outro valor desliga).
 */
export function registerContentProtection(): void {
  ipcMain.handle('window:content-protection', (event, on: unknown): void => {
    BrowserWindow.fromWebContents(event.sender)?.setContentProtection(on === true)
  })
}
