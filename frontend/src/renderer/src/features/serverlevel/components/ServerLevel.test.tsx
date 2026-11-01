import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('../api/serverLevel', () => ({ fetchServerLevel: () => new Promise(() => {}) }))
// O selo de nível do servidor toca som ao clicar; o callStore e o áudio não entram no SSR.
vi.mock('../../call/store/callStore', () => ({ useCallStore: { getState: () => ({}) } }))
vi.mock('../../call/lib/sounds', () => ({ playSound: vi.fn() }))
vi.mock('../../../shared/ui/Modal', () => ({
  default: ({
    open,
    title,
    children
  }: {
    open: boolean
    title?: string
    children: React.ReactNode
  }) => (open ? <div data-modal={title}>{children}</div> : null)
}))
// SSR lê o estado atual do zustand (mesmo truque do SidebarDialogs.test).
vi.spyOn(React, 'useSyncExternalStore').mockImplementation((_subscribe, getSnapshot) =>
  getSnapshot()
)

import { useServerLevelStore } from '../store/serverLevelStore'
import { useServerLevelModalStore } from '../store/serverLevelModalStore'
import ServerLevelChip from './ServerLevelChip'
import ServerLevelCard from './ServerLevelCard'
import ServerLevelDetails from './ServerLevelDetails'
import ServerLevelModal from './ServerLevelModal'

const progress = { server_id: 's1', level: 3, xp: 1300, xp_into_level: 50, xp_for_next: 2250 }

describe('nível do servidor na tela', () => {
  beforeEach(() => {
    useServerLevelStore.getState().reset()
    useServerLevelModalStore.getState().close()
  })

  it('sem nível carregado, chip e cartão não aparecem', () => {
    expect(renderToStaticMarkup(<ServerLevelChip serverId="s1" />)).toBe('')
    expect(renderToStaticMarkup(<ServerLevelCard serverId="s1" onOpen={() => {}} />)).toBe('')
  })

  it('chip do cabeçalho mostra o nível', () => {
    useServerLevelStore.getState().apply(progress)
    expect(renderToStaticMarkup(<ServerLevelChip serverId="s1" />)).toContain('Nv. 3')
  })

  it('chip é um botão com rótulo para rever a animação do nível', () => {
    useServerLevelStore.getState().apply(progress)
    const html = renderToStaticMarkup(<ServerLevelChip serverId="s1" />)
    expect(html).toMatch(/^<button type="button"/)
    expect(html).toContain('aria-label="Ver animação do nível do servidor"')
    expect(html).toContain('clique para ver a animação')
  })

  it('detalhamento também traz o selo clicável do nível', () => {
    useServerLevelStore.setState({ byServer: { s1: progress }, week: { s1: [] } })
    const html = renderToStaticMarkup(<ServerLevelDetails serverId="s1" />)
    expect(html).toContain('aria-label="Ver animação do nível do servidor"')
  })

  it('chip muda de material por faixa de nível', () => {
    useServerLevelStore.getState().apply(progress)
    expect(renderToStaticMarkup(<ServerLevelChip serverId="s1" />)).toContain('data-tier="Bronze"')
    useServerLevelStore.getState().apply({ ...progress, level: 12 })
    expect(renderToStaticMarkup(<ServerLevelChip serverId="s1" />)).toContain('data-tier="Ouro"')
    useServerLevelStore.getState().apply({ ...progress, level: 31 })
    expect(renderToStaticMarkup(<ServerLevelChip serverId="s1" />)).toContain(
      'server-level-legendary'
    )
  })

  it('cartão do menu mostra nível, barra e o XP do nível', () => {
    useServerLevelStore.getState().apply(progress)
    const html = renderToStaticMarkup(<ServerLevelCard serverId="s1" onOpen={() => {}} />)
    expect(html).toContain('Nível 3')
    expect(html).toContain('50/2.250 XP')
    expect(html).toContain('aria-valuenow="2"')
    expect(html).toContain('Ver de onde vem o XP')
  })

  it('detalhamento lista as fontes da semana, da maior para a menor', () => {
    useServerLevelStore.setState({
      byServer: { s1: progress },
      week: {
        s1: [
          { source: 'mensagens', xp: 40 },
          { source: 'voz', xp: 120 }
        ]
      }
    })
    const html = renderToStaticMarkup(<ServerLevelDetails serverId="s1" />)
    expect(html).toContain('1.300 XP no total')
    expect(html).toContain('Últimos 7 dias')
    expect(html.indexOf('Tempo em call')).toBeLessThan(html.indexOf('Mensagens'))
    expect(html).toContain('160 XP')
  })

  it('detalhamento sem dados mostra o carregando', () => {
    expect(renderToStaticMarkup(<ServerLevelDetails serverId="s1" />)).toContain(
      'Carregando nível…'
    )
  })

  it('modal abre pelo store com o título', () => {
    expect(renderToStaticMarkup(<ServerLevelModal />)).toBe('')
    useServerLevelModalStore.getState().open('s1')
    expect(renderToStaticMarkup(<ServerLevelModal />)).toContain('data-modal="Nível do servidor"')
  })
})
