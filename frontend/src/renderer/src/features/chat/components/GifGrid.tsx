import type { GiphyItem } from '../api/giphy'
import GifFavoriteButton from './GifFavoriteButton'

/** Grade de GIFs do seletor: clicar envia, a estrela favorita (sempre visível, sem depender de hover). */
export default function GifGrid({
  gifs,
  favoriteIds,
  onSelect,
  onToggleFavorite
}: {
  gifs: GiphyItem[]
  favoriteIds: ReadonlySet<string>
  onSelect: (gif: GiphyItem) => void
  onToggleFavorite: (gif: GiphyItem) => void
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-2">
      {gifs.map((gif) => (
        <div key={gif.id} className="relative h-28">
          <button
            type="button"
            title={gif.title}
            onClick={() => onSelect(gif)}
            className="focus-ring h-full w-full cursor-pointer overflow-hidden rounded-xl bg-white/5 transition-transform hover:scale-102"
          >
            <img
              src={gif.preview_url || gif.url}
              alt={gif.title}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </button>
          <GifFavoriteButton
            gif={gif}
            favorite={favoriteIds.has(gif.id)}
            onToggle={onToggleFavorite}
            className="absolute right-1 top-1"
          />
        </div>
      ))}
    </div>
  )
}
