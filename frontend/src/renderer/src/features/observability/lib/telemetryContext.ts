import { IS_WEB } from '../../../shared/lib/config'
import type { ClientContext } from './telemetryTypes'

// Contexto técnico de quem manda a telemetria: SO, versão do app (a do build
// quando o preload não responde, como no app web), web ou
// desktop, placa de vídeo (renderer do WebGL), tipo de rede (quando o
// navegador conta) e núcleos do processador. Lido uma vez por sessão do app.

const OS: [RegExp, string][] = [
  [/Android/, 'Android'],
  [/iPhone|iPad/, 'iOS'],
  [/CrOS/, 'ChromeOS'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Linux|X11/, 'Linux']
]

export function osName(userAgent: string): string {
  return OS.find(([re]) => re.test(userAgent))?.[1] ?? 'outro'
}

interface GlLike {
  getExtension(name: string): { UNMASKED_RENDERER_WEBGL: number } | null
  getParameter(param: number): unknown
}

/** "ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 …)": a placa sem a máscara do WebGL. */
export function gpuName(gl: GlLike | null): string {
  const ext = gl?.getExtension('WEBGL_debug_renderer_info')
  const value = ext ? gl?.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null
  return typeof value === 'string' ? value : ''
}

interface ConnectionLike {
  type?: string
  effectiveType?: string
}

/** wifi/ethernet/cellular quando o navegador conta; senão a estimativa (4g, 3g…). */
export function networkOf(connection: ConnectionLike | undefined): string {
  return connection?.type ?? connection?.effectiveType ?? ''
}

export interface ContextInput {
  userAgent: string
  version: string
  web: boolean
  gpu: string
  network: string
  cores: number
}

export function buildClientContext(input: ContextInput): ClientContext {
  return {
    os: osName(input.userAgent),
    app_version: input.version,
    target: input.web ? 'web' : 'desktop',
    gpu: input.gpu,
    network: input.network,
    cores: input.cores
  }
}

function readGpu(): string {
  try {
    const gl = document.createElement('canvas').getContext('webgl') as unknown as GlLike | null
    return gpuName(gl)
  } catch {
    return ''
  }
}

let gpu: string | null = null

/** A versão do build (vite.renderer.shared.ts); vazia nos testes. */
const BUILD_VERSION = import.meta.env.VITE_APP_VERSION ?? ''

/** A do preload (desktop); sem resposta (app web), a do build. */
export function appVersionOf(fromPreload: string | null | undefined, fromBuild: string | undefined): string {
  return fromPreload || fromBuild || ''
}

/** O contexto agora (a rede pode mudar; a placa é lida uma vez). */
export async function loadClientContext(): Promise<ClientContext> {
  gpu ??= readGpu()
  const preload = await window.api?.updates?.currentVersion().catch(() => '')
  const version = appVersionOf(preload, BUILD_VERSION)
  const nav = navigator as Navigator & { connection?: ConnectionLike }
  return buildClientContext({
    userAgent: nav.userAgent,
    version,
    web: IS_WEB,
    gpu,
    network: networkOf(nav.connection),
    cores: nav.hardwareConcurrency ?? 0
  })
}
