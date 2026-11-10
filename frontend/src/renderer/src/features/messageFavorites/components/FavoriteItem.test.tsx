import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('../../../shared/ui/Avatar', () => ({ default: () => <span>avatar</span> }))

import type { MessageFavorite } from '../api/messageFavorites'
import FavoriteItem from './FavoriteItem'

const noop = (): void => {}

const channelFav: MessageFavorite = {
  message_id: 'm1',
  favorited_at: '2026-11-09T12:00:00Z',
  message: {
    id: 'm1',
    author_id: 'u1',
    author: { id: 'u1', username: 'ana', display_name: 'Ana' },
    channel_id: 'c1',
    content: '**bora** jogar',
    created_at: '2026-11-09T12:00:00Z'
  } as MessageFavorite['message'],
  origin: { server_id: 's1', server_name: 'Salinha', channel_name: 'geral' }
}

describe('FavoriteItem', () => {
  it('mostra a origem, o autor e o texto sem Markdown, com o remover', () => {
    const html = renderToStaticMarkup(<FavoriteItem favorite={channelFav} onOpen={noop} onRemove={noop} />)
    expect(html).toContain('geral')
    expect(html).toContain('Salinha')
    expect(html).toContain('Ana')
    expect(html).toContain('bora jogar')
    expect(html).toContain('title="Ir para a mensagem"')
    expect(html).toContain('aria-label="Remover das favoritas"')
  })

  it('indisponível: só o aviso e o remover, sem abrir', () => {
    const html = renderToStaticMarkup(
      <FavoriteItem
        favorite={{ message_id: 'm2', favorited_at: '', unavailable: true }}
        onOpen={noop}
        onRemove={noop}
      />
    )
    expect(html).toContain('Mensagem indisponível')
    expect(html).toContain('Você não tem mais acesso a essa conversa.')
    expect(html).toContain('aria-label="Remover das favoritas"')
    expect(html).not.toContain('Ir para a mensagem')
  })
})

describe('FavoriteItem sem texto', () => {
  it('mostra o tipo do conteúdo (enquete)', () => {
    const poll = {
      ...channelFav,
      message: { ...channelFav.message!, content: '', poll: { question: 'Qual jogo?' } }
    } as MessageFavorite
    expect(renderToStaticMarkup(<FavoriteItem favorite={poll} onOpen={noop} onRemove={noop} />)).toContain(
      'Qual jogo?'
    )
  })
})
