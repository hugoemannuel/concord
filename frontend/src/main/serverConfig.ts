import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { normalizeServerAddress, type ProbeResult } from '../shared/serverAddress'

// Servidor do app. Build oficial: embutido (VITE_SERVER_URL) e fixo. Build
// genérico (GitHub Releases): o que a pessoa escolheu na tela inicial, salvo
// em <userData>/server.json. Sem nenhum dos dois, o app abre a tela inicial.

const FILE = 'server.json'

/** URL salva (normalizada) ou null se não há arquivo ou ele não serve. */
export function parseSavedServer(text: string): string | null {
  try {
    const value = JSON.parse(text) as { url?: unknown }
    if (typeof value.url !== 'string') return null
    const result = normalizeServerAddress(value.url)
    return result.ok ? result.url : null
  } catch {
    return null
  }
}

export function readSavedServerUrl(dir: string): string | null {
  try {
    return parseSavedServer(readFileSync(join(dir, FILE), 'utf8'))
  } catch {
    return null
  }
}

export function saveServerUrl(dir: string, url: string): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, FILE), JSON.stringify({ url }))
}

export function clearServerUrl(dir: string): void {
  try {
    unlinkSync(join(dir, FILE))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

export interface ServerChoice {
  /** VITE_SERVER_URL do build ('' no genérico). */
  built: string
  saved: string | null
}

/** O embutido manda; depois o salvo. */
export function resolveServerUrl({ built, saved }: ServerChoice): string | null {
  const fixed = built.trim()
  if (fixed) return fixed.replace(/\/+$/, '')
  return saved
}

/** Onde ficam as atualizações do app: <servidor>/updates/. */
export function updateFeedUrl(serverUrl: string | null): string {
  return serverUrl ? new URL('/updates/', serverUrl).toString() : ''
}

/** Lê a resposta do /healthz (200 + {"status":"ok"} = servidor da Salinha pronto). */
export function healthzResult(status: number, body: string): ProbeResult {
  let parsed: { status?: unknown } | null = null
  try {
    parsed = JSON.parse(body) as { status?: unknown }
  } catch {
    parsed = null
  }
  if (status === 200 && parsed?.status === 'ok') return { ok: true, serverVersion: null }
  if (status === 503 && typeof parsed?.status === 'string') {
    return {
      ok: false,
      error: 'O servidor está iniciando ou reiniciando. Tente de novo em instantes.'
    }
  }
  return { ok: false, error: 'Esse endereço não parece ser um servidor da Salinha.' }
}

/** Versão do app que o servidor publica em /updates/latest.yml (linha "version: x.y.z"). */
export function manifestVersion(yaml: string): string | null {
  const match = /^version:\s*['"]?([^'"\s]+)/m.exec(yaml)
  return match ? match[1] : null
}
