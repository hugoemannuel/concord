import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ErrorGroup, ErrorGroupDetail, ErrorGroupsReport } from '../api/errorReports'
import { INITIAL_PANEL, type LoadState, type PanelState } from '../lib/errorPanelState'
import ErrorsTab, { ErrorsPanel } from './ErrorsTab'

const hooks = vi.hoisted(() => ({
  groups: vi.fn(),
  group: vi.fn()
}))
vi.mock('../hooks/useErrorGroups', () => ({ useErrorGroups: hooks.groups }))
vi.mock('../hooks/useErrorGroup', () => ({ useErrorGroup: hooks.group }))

const group: ErrorGroup = {
  fingerprint: 'fp1',
  source: 'renderer',
  kind: 'TypeError',
  message: 'x is undefined',
  first_seen: '2026-11-20T10:00:00Z',
  last_seen: '2026-11-25T09:00:00Z',
  count: 42,
  users: 3,
  versions: ['1.4.2', '1.4.1', '1.4.0'],
  systems: ['Windows 11'],
  targets: ['desktop', 'web'],
  new_in_version: true
}

const report: ErrorGroupsReport = {
  from: '2026-11-18T12:00:00Z',
  to: '2026-11-25T12:00:00Z',
  versions: ['1.4.2', '1.4.1', '1.4.0'],
  groups: [group, { ...group, fingerprint: 'fp2', message: 'outro', new_in_version: false }]
}

const detail: ErrorGroupDetail = {
  group,
  stack: 'at a (index-abc.js:1:200)',
  translated: 'at handleSend (src/features/chat/send.ts:12:3)',
  screens: [{ screen: '/canal/:id', count: 40 }],
  recent: [
    {
      at: '2026-11-25T09:00:00Z',
      username: 'ana',
      app_version: '1.4.2',
      os: 'Windows 11',
      target: 'desktop',
      screen: '/canal/:id',
      in_call: true,
      in_live: false,
      count: 7
    }
  ]
}

const ready = <T,>(data: T): LoadState<T> => ({ status: 'ready', data })

const render = (panel: PanelState): string =>
  renderToStaticMarkup(<ErrorsPanel days={7} panel={panel} dispatch={() => {}} />)

beforeEach(() => {
  hooks.groups.mockReset().mockReturnValue({ state: ready(report), reload: () => {} })
  hooks.group.mockReset().mockReturnValue({ state: ready(detail), reload: () => {} })
})

describe('aba Erros', () => {
  it('abre na lista, sem filtro, buscando o período da aba', () => {
    const html = renderToStaticMarkup(<ErrorsTab days={3} />)
    expect(hooks.groups).toHaveBeenCalledWith(3, '', '')
    expect(html).toContain('TypeError: x is undefined')
    expect(html).toContain('Novo nesta versão')
    expect(html).toContain('1.4.2, 1.4.1 +1')
    expect(html).toContain('42 vezes')
    expect(html).toContain('3 pessoas')
    expect(html).toContain('Desktop/web')
    expect(html).toContain('id="erro-grupo-fp2"')
    expect(html).not.toContain('Voltar à lista')
  })
  it('os filtros escolhidos vão para a busca e aparecem marcados', () => {
    const html = render({ source: 'mobile', version: '1.4.1', open: null })
    expect(hooks.groups).toHaveBeenCalledWith(7, 'mobile', '1.4.1')
    expect(html).toMatch(/aria-pressed="true"[^>]*>Android</)
    expect(html).toMatch(/aria-pressed="false"[^>]*>Todas</)
    expect(html).toMatch(/<option value="1.4.1"[^>]*selected=""/)
  })
  it('grupo aberto: busca o detalhe e mostra pilha traduzida, telas e ocorrências', () => {
    const html = render({ ...INITIAL_PANEL, open: 'fp1' })
    expect(hooks.group).toHaveBeenCalledWith('fp1', 7)
    expect(html).toContain('Voltar à lista')
    expect(html).toContain('src/features/chat/send.ts:12:3')
    expect(html).not.toContain('index-abc.js')
    expect(html).toContain('Ver pilha crua')
    expect(html).toContain('/canal/:id')
    expect(html).toContain('40 vezes')
    expect(html).toContain('ana')
    expect(html).toContain('Em call')
    expect(html).not.toContain('role="group" aria-label="Origem"')
  })
  it('sem tradução, a pilha crua sem botão de alternar', () => {
    hooks.group.mockReturnValue({ state: ready({ ...detail, translated: '' }), reload: () => {} })
    const html = render({ ...INITIAL_PANEL, open: 'fp1' })
    expect(html).toContain('index-abc.js')
    expect(html).not.toContain('Ver pilha crua')
  })
  it('lista vazia: o texto diz se é por causa dos filtros', () => {
    hooks.groups.mockReturnValue({ state: ready({ ...report, groups: [] }), reload: () => {} })
    expect(render(INITIAL_PANEL)).toContain('Nenhum erro no período.')
    expect(render({ ...INITIAL_PANEL, source: 'backend' })).toContain(
      'Nenhum erro com esses filtros no período.'
    )
  })
  it('estados do pedido', () => {
    const cases: [LoadState<ErrorGroupsReport>, string][] = [
      [{ status: 'loading' }, 'Carregando…'],
      [{ status: 'forbidden' }, 'Só os devs do Salinha veem esta página.'],
      [{ status: 'error' }, 'Tentar de novo']
    ]
    for (const [state, text] of cases) {
      hooks.groups.mockReturnValue({ state, reload: () => {} })
      expect(render(INITIAL_PANEL)).toContain(text)
    }
    hooks.group.mockReturnValue({ state: { status: 'missing' }, reload: () => {} })
    expect(render({ ...INITIAL_PANEL, open: 'fp1' })).toContain(
      'Esse erro não aparece no período escolhido.'
    )
  })
})
