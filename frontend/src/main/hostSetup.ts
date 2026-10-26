import { app, dialog, ipcMain, type BrowserWindow } from 'electron'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { saveServerUrl } from './serverConfig'
import { markQuitting } from './background'
import { deployInput, forgetHost, splitEvents } from './hostPolicy'
import type { HostEvent } from '../shared/hostServer'

// "Hospedar um servidor": instala a Salinha numa VPS pelo SSH. Quem faz é o
// salinha-host que vem dentro do app (resources/host), com a chave pública
// que confere o pacote do servidor; a senha vai pelo stdin, nunca na linha
// de comando nem em disco.
//
// Dev e testes: SALINHA_HOST_BIN=<caminho> usa outro salinha-host.

const exe = (name: string): string => (process.platform === 'win32' ? `${name}.exe` : name)

function deployerPath(): string {
  return process.env.SALINHA_HOST_BIN || join(process.resourcesPath, 'host', exe('salinha-host'))
}

/** Identidade das VPS já vistas (confiança no primeiro acesso, como o ssh). */
const knownHostsPath = (): string => join(app.getPath('userData'), 'vps_known_hosts')

/** Roda o deploy repassando cada evento; resolve com o código de saída. */
function runDeploy(input: object, onEvent: (e: HostEvent) => void): Promise<number> {
  return new Promise((resolve) => {
    const bin = deployerPath()
    if (!existsSync(bin)) {
      onEvent({ type: 'error', message: 'O instalador do servidor não veio junto com o app.' })
      resolve(-1)
      return
    }
    const child = spawn(bin, ['deploy'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let buffer = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      const { events, rest } = splitEvents(buffer + chunk)
      buffer = rest
      events.forEach(onEvent)
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-2000)
    })
    child.on('error', (err) => {
      onEvent({ type: 'error', message: `Não foi possível abrir o instalador: ${err.message}` })
      resolve(-1)
    })
    child.on('close', (code) => {
      if (code !== 0 && stderr.trim()) console.error('[host]', stderr.trim())
      resolve(code ?? -1)
    })
    child.stdin.end(JSON.stringify(input))
  })
}

export function setupHostServer(getWindow: () => BrowserWindow | null): void {
  const fromWindow = (sender: Electron.WebContents): boolean => sender === getWindow()?.webContents
  const send = (event: HostEvent): void => getWindow()?.webContents.send('host:event', event)
  let busy = false
  /** Endereço que o último deploy conferiu de fora (o único que o "concluir" aceita). */
  let readyUrl: string | null = null

  ipcMain.handle('host:deploy', async (event, form: unknown) => {
    if (!fromWindow(event.sender) || busy) return false
    const parsed = deployInput(form, knownHostsPath(), app.getVersion())
    if ('error' in parsed) {
      send({ type: 'error', message: parsed.error })
      return false
    }
    busy = true
    readyUrl = null
    try {
      const code = await runDeploy(parsed.input, (e) => {
        if (e.type === 'ready') readyUrl = e.publicUrl
        send(e)
      })
      return code === 0
    } finally {
      busy = false
    }
  })

  ipcMain.handle('host:pick-key', async (event) => {
    if (!fromWindow(event.sender)) return null
    const window = getWindow()
    const options: Electron.OpenDialogOptions = {
      title: 'Chave SSH da VPS',
      properties: ['openFile', 'showHiddenFiles']
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  // A VPS foi reinstalada (identidade nova) e a pessoa confirmou: esquece a antiga.
  ipcMain.handle('host:forget-key', async (event, host: unknown) => {
    if (!fromWindow(event.sender) || typeof host !== 'string' || !host.trim()) return false
    const path = knownHostsPath()
    const text = await readFile(path, 'utf8').catch(() => '')
    await writeFile(path, forgetHost(text, host.trim()))
    return true
  })

  // Fim do assistente: o app de quem hospeda entra pelo endereço público.
  ipcMain.handle('host:finish', (event) => {
    if (!fromWindow(event.sender) || !readyUrl) return false
    saveServerUrl(app.getPath('userData'), readyUrl)
    setTimeout(() => {
      markQuitting()
      app.relaunch()
      app.quit()
    }, 0)
    return true
  })
}
