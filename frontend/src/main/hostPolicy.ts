import type { HostEvent, VpsForm } from '../shared/hostServer'

// Regras puras do "Hospedar um servidor" (hostSetup.ts faz o I/O).

const HOST_EVENT_TYPES = new Set(['step', 'ready', 'error'])

/**
 * Separa as linhas JSON do stdout do salinha-host. Devolve os eventos
 * completos e o resto (linha ainda pela metade).
 */
export function splitEvents(buffer: string): { events: HostEvent[]; rest: string } {
  const lines = buffer.split('\n')
  const rest = lines.pop() ?? ''
  const events: HostEvent[] = []
  for (const line of lines) {
    const text = line.trim()
    if (!text) continue
    try {
      const value = JSON.parse(text) as { type?: unknown }
      if (typeof value.type === 'string' && HOST_EVENT_TYPES.has(value.type))
        events.push(value as HostEvent)
    } catch {
      // linha que não é evento (log): ignora
    }
  }
  return { events, rest }
}

/** O que vai em JSON no stdin do "salinha-host deploy" (DeployOptions no Go). */
export interface DeployInput {
  host: string
  user: string
  password?: string
  keyPath?: string
  keyPassphrase?: string
  domain?: string
  autoUpdate: boolean
  knownHosts: string
  version: string
}

const str = (value: unknown, max = 4096): string =>
  typeof value === 'string' ? value.slice(0, max) : ''

/**
 * Confere o formulário vindo do renderer e monta a entrada do deploy (null =
 * inválido). Só campos conhecidos passam, com tamanho limitado.
 */
export function deployInput(
  form: unknown,
  knownHosts: string,
  version: string
): { input: DeployInput } | { error: string } {
  if (!form || typeof form !== 'object') return { error: 'Dados da VPS inválidos.' }
  const f = form as Partial<Record<keyof VpsForm, unknown>>
  const host = str(f.host, 255).trim()
  if (!host) return { error: 'Informe o IP da VPS.' }
  if (/[\s/]/.test(host))
    return { error: 'Use só o IP (ou o nome) da VPS, sem http:// nem barras.' }
  const user = str(f.user, 64).trim() || 'root'
  const input: DeployInput = {
    host,
    user,
    autoUpdate: f.autoUpdate === true,
    knownHosts,
    version
  }
  if (f.auth === 'key') {
    const keyPath = str(f.keyPath, 1024)
    if (!keyPath) return { error: 'Escolha o arquivo da chave SSH.' }
    input.keyPath = keyPath
    const passphrase = str(f.keyPassphrase)
    if (passphrase) input.keyPassphrase = passphrase
  } else {
    const password = str(f.password)
    if (!password) return { error: 'Informe a senha da VPS.' }
    input.password = password
  }
  const domain = str(f.domain, 253).trim()
  if (domain) {
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(domain))
      return { error: 'Domínio inválido (ex.: salinha.meudominio.com).' }
    input.domain = domain
  }
  return { input }
}

/** Tira do known_hosts as linhas da VPS (ela foi reinstalada e a pessoa confirmou). */
export function forgetHost(knownHosts: string, host: string): string {
  const names = new Set([host, `[${host}]:22`])
  return knownHosts
    .split('\n')
    .filter((line) => {
      const first = line.split(' ')[0] ?? ''
      return !first.split(',').some((name) => names.has(name) || name.startsWith(`[${host}]:`))
    })
    .join('\n')
}
