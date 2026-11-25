import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PANEL_TABS } from '../lib/panelTabs'
import LiveObservability from './LiveObservability'

const render = (url: string): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/observabilidade/:aba?" element={<LiveObservability />} />
      </Routes>
    </MemoryRouter>
  )

const selected = (html: string, id: string): boolean =>
  new RegExp(`id="obs-tab-${id}"[^>]*aria-selected="true"`).test(html)

describe('LiveObservability', () => {
  it('a aba da URL fica selecionada e o painel é dela', () => {
    const html = render('/observabilidade/chamadas?dias=3')
    expect(html).toContain('role="tablist"')
    expect(selected(html, 'chamadas')).toBe(true)
    expect(html).toMatch(/id="obs-tab-lives"[^>]*aria-selected="false"[^>]*tabindex="-1"/)
    expect(html).toMatch(/role="tabpanel"[^>]*aria-labelledby="obs-tab-chamadas"/)
    expect(html).toMatch(/aria-pressed="true"[^>]*>3 dias</)
  })
  it('sem aba (ou aba desconhecida) mostra a primeira; período padrão 7 dias', () => {
    for (const url of ['/observabilidade', '/observabilidade/nao-existe']) {
      const html = render(url)
      expect(selected(html, PANEL_TABS[0].id)).toBe(true)
      expect(html).toMatch(/aria-pressed="true"[^>]*>7 dias</)
    }
  })
  it('mostra todas as abas do registro', () => {
    const html = render('/observabilidade/lives')
    for (const tab of PANEL_TABS) expect(html).toContain(`>${tab.label}</button>`)
  })
})
