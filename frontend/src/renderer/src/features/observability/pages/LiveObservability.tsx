import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { LiveReportProvider } from '../components/LiveReportProvider'
import { PanelTabBar } from '../components/PanelTabBar'
import { PeriodPicker } from '../components/PeriodPicker'
import { daysFromParam, findTab, PANEL_ID, tabElementId, tabPath } from '../lib/panelRoute'
import { PANEL_TABS } from '../lib/panelTabs'

/**
 * Painel de observabilidade (só devs, sem link no app): /observabilidade/<aba>?dias=7.
 * As abas vêm do registro lib/panelTabs.tsx. Ver docs/OBSERVABILIDADE.md § Painel.
 */
function LiveObservability(): React.JSX.Element {
  const { aba } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const days = daysFromParam(params.get('dias'))
  const tab = findTab(PANEL_TABS, aba)
  const active = tab ?? PANEL_TABS[0]
  const go = (id: string, d: number): void => {
    navigate(tabPath(id, d), { replace: true })
  }
  return (
    <LiveReportProvider>
      {!tab && <Navigate to={tabPath(active.id, days)} replace />}
      <div className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-primary text-gray-100">
        <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 px-4 py-2">
          <h1 className="text-base font-semibold">Observabilidade</h1>
          <PeriodPicker days={days} onChange={(d) => go(active.id, d)} />
        </header>
        <PanelTabBar tabs={PANEL_TABS} active={active.id} onSelect={(id) => go(id, days)} />
        <main
          id={PANEL_ID}
          role="tabpanel"
          aria-labelledby={tabElementId(active.id)}
          className="flex-1 overflow-y-auto p-4"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-6">
            <active.Component days={days} />
          </div>
        </main>
      </div>
    </LiveReportProvider>
  )
}

export default LiveObservability
