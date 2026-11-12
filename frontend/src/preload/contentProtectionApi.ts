import { ipcRenderer } from 'electron'

// window.api.contentProtection: esconde a janela de print e gravação enquanto
// uma mídia de visualização única está aberta (main/window/contentProtection).
export const contentProtectionApi = {
  set(on: boolean): Promise<void> {
    return ipcRenderer.invoke('window:content-protection', on)
  }
}
