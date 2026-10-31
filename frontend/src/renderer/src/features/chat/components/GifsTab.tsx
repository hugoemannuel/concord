import { useMemo } from 'react'
import type { GiphyItem } from '../api/giphy'
import GifGrid from './GifGrid'

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="mb-3">
      <h3 className="mb-1 text-ds-xs font-semibold text-muted">{title}</h3>
      {children}
    </section>
  )
}

/**
 * Aba "GIFs" do seletor de mídia (a busca fica no useGifSearch). Com a busca
 * vazia mostra primeiro os favoritos da pessoa e depois os GIFs em alta.
 */
export default function GifsTab({
  gifs,
  loading,
  favorites,
  searching,
  onSelect,
  onToggleFavorite
}: {
  gifs: GiphyItem[]
  loading: boolean
  favorites: GiphyItem[]
  /** Tem texto na busca: os favoritos saem e só aparece o resultado. */
  searching: boolean
  onSelect: (gif: GiphyItem) => void
  onToggleFavorite: (gif: GiphyItem) => void
}): React.JSX.Element {
  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.id)), [favorites])
  const showFavorites = !searching && favorites.length > 0
  const grid = (list: GiphyItem[]): React.JSX.Element => (
    <GifGrid
      gifs={list}
      favoriteIds={favoriteIds}
      onSelect={onSelect}
      onToggleFavorite={onToggleFavorite}
    />
  )

  let results: React.JSX.Element
  if (loading || gifs.length === 0) {
    results = (
      <div
        className={`flex items-center justify-center text-ds-xs text-faint ${showFavorites ? 'h-16' : 'h-48'}`}
      >
        {loading ? 'Carregando GIFs…' : 'Nenhum GIF encontrado.'}
      </div>
    )
  } else {
    results = grid(gifs)
  }

  if (!showFavorites) return results
  return (
    <>
      <Section title="Favoritos">{grid(favorites)}</Section>
      <Section title="Em alta">{results}</Section>
    </>
  )
}
