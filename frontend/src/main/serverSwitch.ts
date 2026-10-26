import { app, ipcMain, net, protocol, type BrowserWindow } from 'electron'
import { readFile } from 'fs/promises'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { markQuitting } from './background'
import {
  clearServerUrl,
  healthzResult,
  manifestVersion,
  readSavedServerUrl,
  resolveServerUrl,
  saveServerUrl
} from './serverConfig'
import { normalizeServerAddress, type ProbeResult, type ServerInfo } from '../shared/serverAddress'
import {
  buildConnectSrc,
  buildMediaSrc,
  DEFAULT_SERVER_URL,
  fillCsp
} from '../renderer/src/lib/serverUrl'

// Escolha do servidor no build genérico: a tela inicial confere o endereço
// por aqui (net.fetch do main, sem abrir a CSP do renderer), salva e reabre o
// app já falando com ele.

const PROBE_TIMEOUT_MS = 6000
const UNREACHABLE =
  'Não foi possível falar com esse servidor. Confira o endereço e se ele está ligado.'

/** `fixed`: embutido no build (oficial) ou dev — não dá para trocar no app. */
export type BootServer = ServerInfo

/**
 * Servidor desta execução (decidido uma vez, no boot). No dev (yarn dev) o
 * renderer vem do servidor do Vite com a CSP do VITE_SERVER_URL ou do backend
 * local, então fica fixo nele, como sempre foi.
 */
export function bootServer(dev: boolean): BootServer {
  if (dev) return { url: __CONCORD_SERVER_URL__.trim() || DEFAULT_SERVER_URL, fixed: true }
  return {
    url: resolveServerUrl({
      built: __CONCORD_SERVER_URL__,
      saved: readSavedServerUrl(app.getPath('userData'))
    }),
    fixed: __CONCORD_SERVER_URL__.trim() !== ''
  }
}

async function probe(url: string): Promise<ProbeResult> {
  try {
    const res = await net.fetch(`${url}/healthz`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
    })
    const result = healthzResult(res.status, await res.text())
    if (!result.ok) return result
    // Versão do app que o servidor distribui: só informativa (pode não ter).
    const manifest = await net
      .fetch(`${url}/updates/latest.yml`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
      })
      .then((r) => (r.ok ? r.text() : ''))
      .catch(() => '')
    return { ok: true, serverVersion: manifestVersion(manifest) }
  } catch {
    return { ok: false, error: UNREACHABLE }
  }
}

function relaunch(): void {
  markQuitting()
  app.relaunch()
  app.quit()
}

export function setupServerSwitch(
  getWindow: () => BrowserWindow | null,
  { url, fixed }: BootServer
): void {
  const fromWindow = (sender: Electron.WebContents): boolean => sender === getWindow()?.webContents

  ipcMain.handle('server:info', (): ServerInfo => ({ url, fixed }))

  ipcMain.handle('server:probe', async (event, input: unknown): Promise<ProbeResult> => {
    if (!fromWindow(event.sender) || typeof input !== 'string')
      return { ok: false, error: UNREACHABLE }
    const address = normalizeServerAddress(input)
    return address.ok ? probe(address.url) : address
  })

  // Confere de novo antes de salvar: só vale um servidor que respondeu agora.
  ipcMain.handle('server:connect', async (event, input: unknown): Promise<ProbeResult> => {
    if (!fromWindow(event.sender) || fixed || typeof input !== 'string') {
      return { ok: false, error: UNREACHABLE }
    }
    const address = normalizeServerAddress(input)
    if (!address.ok) return address
    const result = await probe(address.url)
    if (!result.ok) return result
    saveServerUrl(app.getPath('userData'), address.url)
    setTimeout(relaunch, 0)
    return result
  })

  // "Trocar servidor": o renderer já saiu da conta; volta para a tela inicial.
  ipcMain.handle('server:forget', (event) => {
    if (!fromWindow(event.sender) || fixed) return false
    clearServerUrl(app.getPath('userData'))
    setTimeout(relaunch, 0)
    return true
  })
}

/**
 * Build genérico: o index.html sai do build com os marcadores da CSP; aqui eles
 * viram o servidor escolhido (connect-src/media-src só dele), sem mudar a
 * origem file:// (onde fica o login). O resto dos arquivos passa direto.
 */
export function serveRendererCsp(indexPath: string, serverUrl: string | null): void {
  // Windows não diferencia maiúsculas no caminho (C:\ vs c:\ na URL).
  const norm = (p: string): string =>
    process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p)
  const target = norm(indexPath)
  const url = serverUrl ?? undefined
  protocol.handle('file', async (request) => {
    let path = ''
    try {
      path = norm(fileURLToPath(request.url))
    } catch {
      path = ''
    }
    if (path !== target) return net.fetch(request, { bypassCustomProtocolHandlers: true })
    const html = await readFile(indexPath, 'utf8')
    return new Response(
      fillCsp(html, { connectSrc: buildConnectSrc(url), mediaSrc: buildMediaSrc(url) }),
      {
        headers: { 'content-type': 'text/html; charset=utf-8' }
      }
    )
  })
}
