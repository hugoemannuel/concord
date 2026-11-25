import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReportState } from '../../hooks/useLiveReport'
import type { ServerReportState } from '../../hooks/useServerReport'
import { LiveReportContext } from '../../hooks/useSharedLiveReport'
import ServerTab from './ServerTab'

let serverState: ServerReportState = { status: 'loading' }
vi.mock('../../hooks/useServerReport', () => ({
  useServerReport: () => ({ state: serverState, reload: () => {} })
}))

const render = (server: ServerReportState, live: ReportState): string => {
  serverState = server
  return renderToStaticMarkup(
    <LiveReportContext.Provider
      value={{ days: 7, state: live, reload: () => {}, request: () => {} }}
    >
      <ServerTab days={7} />
    </LiveReportContext.Provider>
  )
}

describe('ServerTab', () => {
  it('quem não é dev vê o aviso uma vez só', () => {
    const html = render({ status: 'forbidden' }, { status: 'forbidden' })
    expect(html.split('Só os devs do Salinha veem esta página.')).toHaveLength(2)
  })

  it('a VPS e a API carregam à parte do LiveKit', () => {
    const html = render({ status: 'error' }, { status: 'loading' })
    expect(html).toContain('Tentar de novo')
    expect(html).toContain('Carregando')
  })
})
