import { percentile } from '../../../../shared/lib/perf/percentile'

// Latência das chamadas do app à API vista por quem usa (Resource Timing).
// Só a duração entra: a URL nunca é guardada.

const INITIATORS = new Set(['fetch', 'xmlhttprequest'])
const MAX_SAMPLES = 500

interface ResourceLike {
  name: string
  duration: number
  initiatorType: string
}

/**
 * O endereço da API como o Resource Timing o mostra: absoluto. No web o
 * API_BASE_URL é relativo ('/api'); sem página para resolver, fica como veio.
 */
export function absoluteApiBase(apiBaseUrl: string, pageHref: string | undefined): string {
  try {
    return new URL(apiBaseUrl, pageHref).href.replace(/\/$/, '')
  } catch {
    return apiBaseUrl
  }
}

export class ApiTimings {
  private durations: number[] = []
  private readonly prefix: string
  /** A própria telemetria (/api/obs/) não é a latência que a pessoa sente. */
  private readonly own: string

  /**
   * `apiBaseUrl`: o endereço da API do servidor do app (…/api), absoluto ou
   * relativo a `pageHref` (a página do app, no web).
   */
  constructor(apiBaseUrl: string, pageHref: string | undefined = globalThis.location?.href) {
    const base = absoluteApiBase(apiBaseUrl, pageHref)
    this.prefix = `${base}/`
    this.own = `${base}/obs/`
  }

  add(entry: ResourceLike): void {
    if (!INITIATORS.has(entry.initiatorType) || !this.counts(entry.name)) return
    this.durations.push(entry.duration)
    if (this.durations.length > MAX_SAMPLES) this.durations.shift()
  }

  private counts(url: string): boolean {
    return url.startsWith(this.prefix) && !url.startsWith(this.own)
  }

  /** p50, p95 e quantas desde a última take, e zera. */
  take(): { p50Ms: number | null; p95Ms: number | null; count: number } {
    const taken = this.durations
    this.durations = []
    const round = (v: number | null): number | null => (v === null ? null : Math.round(v))
    return {
      p50Ms: round(percentile(taken, 50)),
      p95Ms: round(percentile(taken, 95)),
      count: taken.length
    }
  }
}
