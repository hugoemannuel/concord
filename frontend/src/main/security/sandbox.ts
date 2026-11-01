// Toda janela do app abre com o sandbox do Chromium: o renderer (e o preload)
// não tem Node, só o contextBridge/ipcRenderer. Um bug no renderer ou no
// Chromium fica preso no processo isolado. O que precisa de Node (helpers,
// arquivos, env) mora no main, atrás de IPC conferido (window/ipcGuard).

/** webPreferences comuns a toda janela com conteúdo do app. */
export const SANDBOXED_PREFERENCES = {
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false
} as const

/** Antes do app.ready: força o sandbox em qualquer janela, até as futuras. */
export function enforceSandbox(app: { enableSandbox(): void }): void {
  app.enableSandbox()
}
