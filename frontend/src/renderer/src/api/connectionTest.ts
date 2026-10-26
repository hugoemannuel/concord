import { API_BASE_URL } from '../lib/config'

export type ConnectionTestResult =
  | { kind: 'reached'; ms: number }
  | { kind: 'timeout' }
  | { kind: 'unreachable' }

const TEST_TIMEOUT_MS = 8000

/**
 * Chega ao servidor? Qualquer resposta HTTP serve (um cadastro vazio volta 400
 * antes de gastar limite ou CPU); só rede, DNS ou bloqueio fazem o fetch falhar.
 */
export async function testConnection(): Promise<ConnectionTestResult> {
  const started = performance.now()
  try {
    await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS)
    })
    return { kind: 'reached', ms: Math.round(performance.now() - started) }
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'TimeoutError'
    return timedOut ? { kind: 'timeout' } : { kind: 'unreachable' }
  }
}

/** Endereço que o app tenta alcançar (sem o /api); só o host no desktop. */
export function serverHost(apiBaseUrl: string = API_BASE_URL): string {
  try {
    return new URL(apiBaseUrl).host
  } catch {
    // Build web: a API fica na mesma origem da página.
    return typeof location !== 'undefined' ? location.host : ''
  }
}

export function describeTest(result: ConnectionTestResult, host: string): string {
  switch (result.kind) {
    case 'reached':
      return `O servidor (${host}) respondeu em ${result.ms} ms. Tente de novo.`
    case 'timeout':
      return `O servidor (${host}) não respondeu a tempo. Tente de novo em instantes.`
    case 'unreachable':
      return `Não foi possível alcançar ${host}. Verifique a internet, troque o DNS (ex.: 1.1.1.1) ou libere o Salinha no antivírus/firewall.`
  }
}
