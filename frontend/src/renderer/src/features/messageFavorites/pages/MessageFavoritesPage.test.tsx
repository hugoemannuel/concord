import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('../components/FavoriteItem', () => ({
  default: (p: { favorite: { message_id: string } }) => <p>item-{p.favorite.message_id}</p>
}))
vi.mock('../../../shared/ui/skeleton/layouts', () => ({
  PinnedListSkeleton: () => <p>skeleton</p>
}))

import type { MessageFavorite } from '../api/messageFavorites'
import { FavoritesBody } from './MessageFavoritesPage'

const noop = (): void => {}
const body = (items: MessageFavorite[] | null, loading = false, error: string | null = null): string =>
  renderToStaticMarkup(
    <FavoritesBody
      items={items}
      loading={loading}
      error={error}
      onRetry={noop}
      onOpen={noop}
      onRemove={noop}
    />
  )

const fav = (id: string): MessageFavorite => ({ message_id: id, favorited_at: '' })

describe('FavoritesBody', () => {
  it('carregando pela primeira vez: o esqueleto', () => {
    expect(body(null, true)).toContain('skeleton')
  })

  it('sem favoritas: o convite a favoritar', () => {
    expect(body([])).toContain('Nenhuma mensagem favorita ainda')
    expect(body(null)).toContain('Nenhuma mensagem favorita ainda')
  })

  it('erro sem lista: o aviso e o tentar de novo', () => {
    const html = body(null, false, 'Não foi possível carregar as favoritas.')
    expect(html).toContain('role="alert"')
    expect(html).toContain('Tentar de novo')
  })

  it('erro ao recarregar mantém a lista que já tinha', () => {
    const html = body([fav('m1')], false, 'Não foi possível carregar as favoritas.')
    expect(html).toContain('item-m1')
    expect(html).not.toContain('role="alert"')
  })

  it('lista na ordem que veio', () => {
    const html = body([fav('m1'), fav('m2')])
    expect(html.indexOf('item-m1')).toBeLessThan(html.indexOf('item-m2'))
  })
})
