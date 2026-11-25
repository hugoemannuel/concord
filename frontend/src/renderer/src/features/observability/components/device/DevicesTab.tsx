import Button from '../../../../shared/ui/Button'
import { Skeleton, SkeletonRegion } from '../../../../shared/ui/skeleton/Skeleton'
import { useDeviceReport, type DeviceReportState } from '../../hooks/device/useDeviceReport'
import { summaryLine } from '../../lib/device/deviceFormat'
import { HeaviestDevices } from './HeaviestDevices'
import { StateBaseline } from './StateBaseline'
import { VersionTable } from './VersionTable'

function DevicesSkeleton(): React.JSX.Element {
  return (
    <SkeletonRegion label="Carregando aparelhos…" className="flex flex-col gap-6">
      <Skeleton className="h-4 w-48 max-w-full" />
      <div className="grid gap-2 lg:grid-cols-2">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
      <Skeleton className="h-32 rounded-lg" />
    </SkeletonRegion>
  )
}

export function DevicesTabBody({
  state,
  onRetry
}: {
  state: DeviceReportState
  onRetry: () => void
}): React.JSX.Element {
  if (state.status === 'loading') return <DevicesSkeleton />
  if (state.status === 'forbidden') return <p className="text-ds-sm text-muted">Só para devs.</p>
  if (state.status === 'error') {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-ds-sm text-danger">Não foi possível carregar os aparelhos.</p>
        <Button variant="ghost" onClick={onRetry}>
          Tentar de novo
        </Button>
      </div>
    )
  }
  const { report } = state
  return (
    <>
      <p className="text-ds-sm text-secondary">{summaryLine(report.people, report.samples)}</p>
      <HeaviestDevices rows={report.worst} />
      <StateBaseline rows={report.baseline} />
      <VersionTable rows={report.versions} />
    </>
  )
}

/**
 * Aba "Dispositivos" do painel de observabilidade (só devs): app pesado,
 * travado ou sem aceleração, por pessoa, estado e versão. Ver
 * docs/adr/0069-metricas-do-aparelho.md.
 */
export default function DevicesTab({ days }: { days: number }): React.JSX.Element {
  const { state, reload } = useDeviceReport(days)
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <DevicesTabBody state={state} onRetry={reload} />
    </div>
  )
}
