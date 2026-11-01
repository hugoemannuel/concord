import { useEffect } from 'react'
import { useServerLevelStore } from '../store/serverLevelStore'
import { formatXP, weekBreakdown } from '../lib/serverLevel'
import ServerLevelBar from './ServerLevelBar'
import ServerLevelChip from './ServerLevelChip'

/** Nível, barra e de onde veio o XP nos últimos 7 dias, por fonte. */
function ServerLevelDetails({ serverId }: { serverId: string }): React.JSX.Element {
  const progress = useServerLevelStore((s) => s.byServer[serverId])
  const week = useServerLevelStore((s) => s.week[serverId])
  const load = useServerLevelStore((s) => s.load)
  // Sempre recarrega: a semana não vem pelo WS.
  useEffect(() => {
    void load(serverId)
  }, [serverId, load])

  if (!progress) return <p className="text-ds-sm text-muted">Carregando nível…</p>
  const { rows, total } = weekBreakdown(week ?? [])

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="rounded-xl border border-subtle bg-fg/5 p-3">
        <ServerLevelBar progress={progress} />
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="min-w-0 text-ds-xs text-muted">{formatXP(progress.xp)} XP no total</p>
          <ServerLevelChip serverId={serverId} />
        </div>
      </div>

      <section aria-labelledby="server-level-week">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 id="server-level-week" className="text-ds-sm font-semibold text-strong">
            Últimos 7 dias
          </h3>
          <span className="text-ds-xs text-muted">{formatXP(total)} XP</span>
        </div>
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.source} className="min-w-0">
              <div className="mb-1 flex items-baseline justify-between gap-2 text-ds-sm">
                <span className="truncate text-normal">{row.label}</span>
                <span className="shrink-0 text-muted">{formatXP(row.xp)} XP</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-fg/10" aria-hidden="true">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${row.percent}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-ds-xs text-muted">
        O nível sobe só com quem usa o servidor: membros novos, mensagens, figurinhas, sons, tempo
        em call e lives. Contas sem e-mail confirmado e bots não contam, e cada pessoa tem um limite
        por dia em cada fonte.
      </p>
    </div>
  )
}

export default ServerLevelDetails
