import AlertsTab from '../components/tabs/AlertsTab'
import BreakdownTab from '../components/tabs/BreakdownTab'
import CallsTab from '../components/tabs/CallsTab'
import DevicesTab from '../components/device/DevicesTab'
import EventsTab from '../components/tabs/EventsTab'
import LivesTab from '../components/tabs/LivesTab'
import ServerTab from '../components/tabs/ServerTab'
import ErrorsTab from '../../errorReports/components/ErrorsTab'

// Registro das abas do painel /observabilidade (docs/OBSERVABILIDADE.md § Painel).
// Aba nova = uma entrada aqui: `id` vira a URL (/observabilidade/<id>), `label` é
// o texto da aba, e `Component` recebe o período escolhido e busca os próprios
// dados. A primeira é a que abre sem id na URL.

export interface PanelTab {
  id: string
  label: string
  Component: React.ComponentType<{ days: number }>
}

export const PANEL_TABS: PanelTab[] = [
  { id: 'lives', label: 'Lives', Component: LivesTab },
  { id: 'chamadas', label: 'Chamadas', Component: CallsTab },
  { id: 'servidor', label: 'Servidor', Component: ServerTab },
  { id: 'distribuicao', label: 'Distribuição', Component: BreakdownTab },
  { id: 'eventos', label: 'Eventos', Component: EventsTab },
  { id: 'erros', label: 'Erros', Component: ErrorsTab },
  { id: 'dispositivos', label: 'Dispositivos', Component: DevicesTab },
  { id: 'alertas', label: 'Alertas', Component: AlertsTab }
]
