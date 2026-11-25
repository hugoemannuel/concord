// CPU do sistema inteiro (todos os programas, não só o app) pela diferença
// entre duas leituras de os.cpus(): ocupado / total, somando os núcleos.

interface CpuTimes {
  times: { user: number; nice: number; sys: number; idle: number; irq: number }
}

interface Totals {
  busy: number
  total: number
}

function totals(cores: CpuTimes[]): Totals {
  let busy = 0
  let total = 0
  for (const { times } of cores) {
    const all = times.user + times.nice + times.sys + times.idle + times.irq
    busy += all - times.idle
    total += all
  }
  return { busy, total }
}

export class SystemCpu {
  private previous: Totals | null = null

  /** % ocupada desde a leitura anterior; null na primeira ou se o contador não andou. */
  sample(cores: CpuTimes[]): number | null {
    const now = totals(cores)
    const before = this.previous
    this.previous = now
    if (!before) return null
    const total = now.total - before.total
    const busy = now.busy - before.busy
    if (total <= 0 || busy < 0) return null
    return Math.min(100, (busy / total) * 100)
  }
}
