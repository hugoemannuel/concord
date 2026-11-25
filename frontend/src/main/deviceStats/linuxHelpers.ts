// Helpers nativos no Linux (concord-live e afins): filhos diretos do processo
// principal que o getAppMetrics não conhece. Lidos pelo /proc, assumindo 100
// ticks/s e páginas de 4 KiB (o padrão do kernel; outra configuração erra a
// escala, não o sinal). Só números somados: nunca nome nem linha de comando.

const TICKS_PER_SECOND = 100
const PAGE_BYTES = 4096

type ReadFile = (path: string) => string | null

export interface HelperStats {
  cpu: number | null
  memMB: number | null
}

export function parseChildren(raw: string): number[] {
  return raw
    .split(/\s+/)
    .filter(Boolean)
    .map(Number)
    .filter((pid) => Number.isInteger(pid) && pid > 0)
}

/** utime+stime (campos 14 e 15) e o início (22): contados depois do ")" do nome. */
export function parseStatTicks(raw: string): { ticks: number; start: string } | null {
  const fields = raw.slice(raw.lastIndexOf(')') + 2).split(' ')
  const ticks = Number(fields[11]) + Number(fields[12])
  const start = fields[19]
  return raw.includes(')') && Number.isFinite(ticks) && start ? { ticks, start } : null
}

/** Páginas residentes: 2º campo do statm. */
export function parseStatm(raw: string): number | null {
  const pages = Number(raw.split(' ')[1])
  return Number.isFinite(pages) ? pages : null
}

export class HelperSampler {
  private previous: { time: number; ticks: Map<string, number> } | null = null

  constructor(
    private readonly pid: number,
    private readonly read: ReadFile
  ) {}

  /** `known`: os PIDs que o getAppMetrics já conta (ficam de fora). */
  sample(known: Set<number>, time: number, cores: number): HelperStats {
    const list = this.read(`/proc/${this.pid}/task/${this.pid}/children`)
    if (list === null) return { cpu: null, memMB: null }
    const helpers = parseChildren(list).filter((pid) => !known.has(pid))
    const ticks = new Map<string, number>()
    let pages = 0
    for (const pid of helpers) {
      pages += this.readPages(pid)
      this.readTicks(pid, ticks)
    }
    const cpu = this.cpuSince(ticks, time, cores)
    this.previous = { time, ticks }
    return { cpu, memMB: (pages * PAGE_BYTES) / 1024 / 1024 }
  }

  private readPages(pid: number): number {
    const raw = this.read(`/proc/${pid}/statm`)
    return (raw && parseStatm(raw)) || 0
  }

  private readTicks(pid: number, into: Map<string, number>): void {
    const raw = this.read(`/proc/${pid}/stat`)
    const parsed = raw ? parseStatTicks(raw) : null
    if (parsed) into.set(`${pid}:${parsed.start}`, parsed.ticks)
  }

  /** % da máquina desde a leitura anterior; PID novo ou reaproveitado só entra na próxima. */
  private cpuSince(ticks: Map<string, number>, time: number, cores: number): number | null {
    const before = this.previous
    const elapsed = before ? (time - before.time) / 1000 : 0
    if (!before || elapsed <= 0) return null
    let used = 0
    for (const [key, now] of ticks) {
      const was = before.ticks.get(key)
      if (was !== undefined && now >= was) used += now - was
    }
    return Math.min(100, (used / TICKS_PER_SECOND / elapsed / Math.max(1, cores)) * 100)
  }
}
