import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Server } from '../api/servers'
import type { ServerRailView } from '../lib/serverRailView'
import ServerFolderItem from './ServerFolderItem'

const SERVERS: Server[] = [
  { id: 's1', name: 'Alpha', owner_id: 'u1', created_at: '', updated_at: '' },
  { id: 's2', name: 'Beta', icon_url: 'https://x/b.png', owner_id: 'u1', created_at: '', updated_at: '' }
]

const quiet: ServerRailView = { dimmed: false, badge: 0, voice: null }
const noop = (): void => {}

describe('ServerFolderItem', () => {
  it('recolhida mostra grade 2x2 com miniaturas dos servidores, selos agregados e nome acessível', () => {
    const html = renderToStaticMarkup(
      <ServerFolderItem
        name="Jogos"
        servers={SERVERS}
        collapsed={true}
        anyActive={false}
        view={{ dimmed: false, badge: 7, voice: 'active' }}
        onToggle={noop}
        onContextMenu={noop}
      >
        <div>filho</div>
      </ServerFolderItem>
    )
    expect(html).toContain('aria-label="Jogos"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('>A<')
    expect(html).toContain('<img')
    expect(html).toContain('>7<')
    expect(html).toContain('aria-label="Chamada em andamento"')
    expect(html).not.toContain('filho')
  })

  it('expandida mostra cabeçalho com ícone de pasta e renderiza os servidores filhos dentro da pílula', () => {
    const html = renderToStaticMarkup(
      <ServerFolderItem
        name="Comunidades"
        servers={SERVERS}
        collapsed={false}
        anyActive={true}
        view={quiet}
        onToggle={noop}
        onContextMenu={noop}
      >
        <div data-testid="srv-inside">Servidores da pasta</div>
      </ServerFolderItem>
    )
    expect(html).toContain('aria-label="Comunidades"')
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('Servidores da pasta')
  })
})
