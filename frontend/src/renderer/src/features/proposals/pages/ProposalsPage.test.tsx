import { describe, expect, it, vi } from 'vitest'

vi.mock('./Proposals', () => ({ default: () => <div data-board /> }))
vi.mock('../components/ArchivedProposals', () => ({ default: () => <div data-archived /> }))

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import ProposalsPage from './ProposalsPage'

const render = (url: string): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[url]}>
      <ProposalsPage />
    </MemoryRouter>
  )

describe('ProposalsPage', () => {
  it('abre no quadro, com as duas abas e o quadro selecionado', () => {
    const html = render('/proposals')
    expect(html).toContain('role="tablist"')
    expect(html).toMatch(/id="proposals-tab-board"[^>]*aria-selected="true"/)
    expect(html).toMatch(/id="proposals-tab-archived"[^>]*aria-selected="false"[^>]*tabindex="-1"/)
    expect(html).toContain('Arquivadas')
    expect(html).toContain('data-board')
    expect(html).not.toContain('data-archived')
  })

  it('?aba=arquivadas abre a lista de arquivadas', () => {
    const html = render('/proposals?aba=arquivadas')
    expect(html).toMatch(/id="proposals-tab-archived"[^>]*aria-selected="true"/)
    expect(html).toContain('data-archived')
    expect(html).not.toContain('data-board')
  })
})
