import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AlertReportState } from '../../hooks/useAlertReport'
import AlertsTab from './AlertsTab'

let state: AlertReportState = { status: 'loading' }
vi.mock('../../hooks/useAlertReport', () => ({ useAlertReport: () => ({ state, reload: vi.fn() }) }))

const render = (next: AlertReportState): string => {
  state = next
  return renderToStaticMarkup(<AlertsTab days={7} />)
}

describe('AlertsTab', () => {
  it('mostra cada estado do pedido', () => {
    expect(render({ status: 'loading' })).toContain('Carregando…')
    expect(render({ status: 'forbidden' })).toContain('Só os devs do Salinha veem esta página.')
    expect(render({ status: 'error' })).toContain('Não foi possível carregar os alertas.')
    expect(render({ status: 'ready', report: { enabled: true, active: [], history: [] } })).toContain(
      'Nada disparado agora.'
    )
  })
})
