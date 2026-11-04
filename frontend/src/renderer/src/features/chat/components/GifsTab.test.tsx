import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import GifsTab from './GifsTab'
import type { GifItem } from '../api/gifs'

const gif = { id: 'g1', title: 'Gato', url: 'https://g/1.gif', preview_url: '' } as GifItem
const fav = { id: 'f1', title: 'Cão', url: 'https://g/2.gif', preview_url: '' } as GifItem

const render = (
  gifs: GifItem[],
  loading: boolean,
  favorites: GifItem[] = [],
  searching = false,
  unavailable = false
): string =>
  renderToStaticMarkup(
    <GifsTab
      gifs={gifs}
      loading={loading}
      unavailable={unavailable}
      favorites={favorites}
      searching={searching}
      onSelect={() => {}}
      onToggleFavorite={() => {}}
    />
  )

describe('GifsTab', () => {
  it('carregando, vazio e com GIFs', () => {
    expect(render([gif], true)).toContain('Carregando GIFs…')
    expect(render([], false)).toContain('Nenhum GIF encontrado.')
    const html = render([gif], false)
    expect(html).toContain('title="Gato"')
    expect(html).toContain('src="https://g/1.gif"')
  })

  it('sem GIFs por falha da busca ou do servidor mostra "GIFs indisponíveis", não "Nenhum GIF"', () => {
    const html = render([], false, [], false, true)
    expect(html).toContain('GIFs indisponíveis.')
    expect(html).not.toContain('Nenhum GIF encontrado.')
    // Carregando tem prioridade; os favoritos continuam aparecendo.
    expect(render([], true, [], false, true)).toContain('Carregando GIFs…')
    const withFav = render([], false, [fav], false, true)
    expect(withFav).toContain('title="Cão"')
    expect(withFav).toContain('GIFs indisponíveis.')
  })

  it('cada GIF tem a estrela de favoritar, visível sem hover', () => {
    const html = render([gif], false)
    expect(html).toContain('aria-label="Favoritar GIF"')
    expect(html).toContain('aria-pressed="false"')
    expect(html).not.toContain('opacity-0')
  })

  it('sem busca, os favoritos vêm primeiro e aparecem marcados', () => {
    const html = render([gif], false, [fav])
    expect(html.indexOf('Favoritos')).toBeGreaterThan(-1)
    expect(html.indexOf('Favoritos')).toBeLessThan(html.indexOf('Em alta'))
    expect(html.indexOf('title="Cão"')).toBeLessThan(html.indexOf('title="Gato"'))
    expect(html).toContain('aria-label="Tirar dos favoritos"')
  })

  it('favoritos aparecem mesmo com os GIFs em alta carregando', () => {
    const html = render([], true, [fav])
    expect(html).toContain('title="Cão"')
    expect(html).toContain('Carregando GIFs…')
  })

  it('buscando, só o resultado aparece', () => {
    const html = render([gif], false, [fav], true)
    expect(html).not.toContain('Favoritos')
    expect(html).not.toContain('title="Cão"')
  })

  it('GIF favorito no resultado da busca também vem marcado', () => {
    expect(render([fav], false, [fav], true)).toContain('aria-pressed="true"')
  })
})
