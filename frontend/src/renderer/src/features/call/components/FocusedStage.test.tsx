import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./ParticipantTile', () => ({ default: () => <div data-tile="" /> }))
vi.mock('../store/callStore', () => ({
  useCallStore: (select: (s: object) => unknown) =>
    select({ setFocusedScreenUser: () => {}, stopWatchingScreen: () => {} })
}))
vi.mock('../hooks/useScreenTileProps', () => ({
  useScreenTileProps: () => ({ watchers: [], locallyMuted: false, onContextMenu: undefined })
}))

// renderToStaticMarkup lê o estado inicial do zustand: troca o store por um simulado.
const stripState = { hidden: false, toggle: () => {} }
vi.mock('../store/participantStripStore', () => ({
  useParticipantStripStore: (select: (s: typeof stripState) => unknown) => select(stripState)
}))

import { renderToStaticMarkup } from 'react-dom/server'
import FocusedStage from './FocusedStage'

const user = { id: 'u1', username: 'ana', display_name: 'Ana' }

const render = (local: boolean): string =>
  renderToStaticMarkup(
    <FocusedStage
      entry={{ userId: 'u1', stream: null, local, watching: true }}
      user={user}
      strip={<span>faixa</span>}
    />
  )

describe('FocusedStage', () => {
  beforeEach(() => {
    stripState.hidden = false
  })

  it('com a faixa visível oferece ocultar os participantes', () => {
    const html = render(false)
    expect(html).toContain('faixa')
    expect(html).toContain('Ocultar participantes')
    expect(html).not.toContain('inert')
  })

  it('com a preferência de ocultar, a faixa fica inerte e oferece mostrar', () => {
    stripState.hidden = true
    const html = render(false)
    expect(html).toContain('Mostrar participantes')
    expect(html).toContain('inert')
  })

  it('na minha própria tela não há botão de fechar transmissão', () => {
    expect(render(true)).not.toContain('Fechar transmissão')
    expect(render(false)).toContain('Fechar transmissão')
  })
})

describe('FocusedStage: botões do cabeçalho', () => {
  it('sair do foco e fechar só aparecem com o mouse no palco', () => {
    const html = render(false)
    expect(html).toContain('group/tile')
    const at = html.indexOf('Sair do modo foco')
    const header = html.slice(html.lastIndexOf('<div', at), at)
    expect(header).toContain('group-hover/tile:opacity-100')
  })
})
