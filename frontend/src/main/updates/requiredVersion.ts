// Versão obrigatória na janelinha de abertura (ADR 0066): se a instalada está
// abaixo da mínima que o servidor exige, o "Abrir sem atualizar" some. A rota
// é pública (o main não tem o token); falha ou demora = não obrigatória (o
// startupFlow trata a rejeição), e o modal do app aberto bloqueia depois.
import { compareVersions } from './linuxInstall'

/** A janelinha não espera mais que isso pela resposta. */
export const REQUIRED_TIMEOUT_MS = 3_000

export interface RequiredUpdateCheckDeps {
  /** Servidor escolhido na abertura (undefined: nenhum respondeu). */
  serverUrl: string | undefined
  currentVersion: string
  fetch: (url: string, init?: RequestInit) => Promise<Response>
  timeoutMs?: number
}

async function fetchMinVersion(
  deps: RequiredUpdateCheckDeps & { serverUrl: string }
): Promise<string> {
  const url = `${deps.serverUrl.replace(/\/+$/, '')}/api/changelog/required`
  const res = await deps.fetch(url, {
    signal: AbortSignal.timeout(deps.timeoutMs ?? REQUIRED_TIMEOUT_MS)
  })
  if (!res.ok) return ''
  const body = (await res.json()) as { min_version?: unknown } | null
  return typeof body?.min_version === 'string' ? body.min_version : ''
}

export function requiredUpdateCheck(deps: RequiredUpdateCheckDeps): () => Promise<boolean> {
  return async () => {
    const { serverUrl } = deps
    if (!serverUrl) return false
    const min = await fetchMinVersion({ ...deps, serverUrl })
    return min !== '' && compareVersions(deps.currentVersion, min) < 0
  }
}
