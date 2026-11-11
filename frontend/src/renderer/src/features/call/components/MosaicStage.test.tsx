import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./StreamMosaic', () => ({ default: () => <div data-mosaic="" /> }))
vi.mock('./StageTiles', () => ({
  MeTile: () => <span>eu</span>,
  PersonTile: ({ user }: { user: { display_name: string } }) => <span>{user.display_name}</span>,
  ScreenTile: () => <div data-screen="" />
}))

// renderToStaticMarkup lê o estado inicial do zustand: troca o store por um simulado.
const stripState = { hidden: false, toggle: () => {} }
vi.mock('../store/participantStripStore', () => ({
  useParticipantStripStore: (select: (s: typeof stripState) => unknown) => select(stripState)
}))

import { renderToStaticMarkup } from 'react-dom/server'
import MosaicStage from './MosaicStage'

const me = { id: 'eu', username: 'eu', display_name: 'Eu' }
const ana = { id: 'ana', username: 'ana', display_name: 'Ana' }
const bia = { id: 'bia', username: 'bia', display_name: 'Bia' }

const render = (screenIds: string[]): string =>
  renderToStaticMarkup(
    <MosaicStage
      screens={screenIds.map((userId) => ({ userId, stream: null, local: false, watching: true }))}
      cameras={[]}
      meId={me.id}
      meInfo={me}
      people={[ana, bia] as never}
      nameOf={(id) => [me, ana, bia].find((u) => u.id === id) ?? me}
    />
  )

describe('MosaicStage: quem está sem vídeo', () => {
  beforeEach(() => {
    stripState.hidden = false
  })

  it('mostra os participantes sem vídeo com o botão de ocultar', () => {
    const html = render(['ana'])
    expect(html).toContain('Bia')
    expect(html).toContain('Ocultar participantes')
    expect(html).not.toContain('inert')
  })

  it('com a preferência de ocultar, a faixa fica inerte e oferece mostrar', () => {
    stripState.hidden = true
    const html = render(['ana'])
    expect(html).toContain('Mostrar participantes')
    expect(html).toContain('inert')
  })

  it('sem ninguém fora do mosaico, não há faixa nem botão', () => {
    const html = renderToStaticMarkup(
      <MosaicStage
        screens={[
          { userId: 'eu', stream: null, local: true, watching: true },
          { userId: 'ana', stream: null, local: false, watching: true }
        ]}
        cameras={[]}
        meId={me.id}
        meInfo={me}
        people={[ana] as never}
        nameOf={(id) => [me, ana].find((u) => u.id === id) ?? me}
      />
    )
    expect(html).not.toContain('participantes')
  })
})
