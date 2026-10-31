import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const call = vi.hoisted(() => ({
  state: { status: 'idle', type: null, serverId: null } as Record<string, unknown>
}))
vi.mock('../../call/store/callStore', () => ({
  useCallStore: (sel: (s: unknown) => unknown) => sel(call.state)
}))

import { ListeningActions } from './ListeningActions'

const track = { app: 'Spotify', title: 'Águas de Março', artist: 'Elis Regina', started_at: 1 }
const render = (): string => renderToStaticMarkup(<ListeningActions listening={track} id="x" />)

beforeEach(() => {
  call.state = { status: 'idle', type: null, serverId: null }
})

describe('ListeningActions', () => {
  it('um link para cada serviço, abrindo fora do app', () => {
    const html = render()
    for (const label of ['YouTube', 'Spotify', 'YouTube Music', 'Deezer', 'Apple Music']) {
      expect(html).toContain(`Ouvir no ${label}`)
    }
    expect(html).toContain(
      'href="https://www.youtube.com/results?search_query=Elis%20Regina%20-%20%C3%81guas%20de%20Mar%C3%A7o"'
    )
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('fora de call: "Adicionar à fila" desabilitado, com o motivo visível', () => {
    const html = render()
    expect(html).toContain('Adicionar à fila do Maestro')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>/)
    expect(html).toContain('Entre numa call de servidor para usar o Maestro.')
  })

  it('em call de servidor: habilitado e sem aviso', () => {
    call.state = { status: 'active', type: 'channel', serverId: 's1' }
    const html = render()
    expect(html).toContain('Adicionar à fila do Maestro')
    expect(html).not.toContain('disabled=""')
    expect(html).not.toContain('Entre numa call')
  })

  it('ao abrir, avisa que está buscando a faixa (links de busca já clicáveis)', () => {
    const html = render()
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('href="https://open.spotify.com/search/')
  })

  it('é um menu com itens (toque e teclado)', () => {
    const html = render()
    expect(html).toContain('role="menu"')
    expect(html).toContain('role="menuitem"')
  })
})
