import { BrowserWindow, ipcMain } from 'electron'
import { sandboxNoticeReason } from './linuxInstall'
import { readSandboxNoticeShown, saveSandboxNoticeShown } from './updateMarks'

/** Linux: o lançador abriu sem o sandbox do Chromium — avisa uma vez. */
export function registerSandboxNotice(getWindow: () => BrowserWindow | null): void {
  let sandboxNotice = sandboxNoticeReason(process.platform, process.env)
  ipcMain.handle('update:sandbox-notice', (event) => {
    if (event.sender !== getWindow()?.webContents || !sandboxNotice) return null
    const reason = sandboxNotice
    sandboxNotice = null
    if (readSandboxNoticeShown()) return null
    saveSandboxNoticeShown()
    return reason
  })
}
