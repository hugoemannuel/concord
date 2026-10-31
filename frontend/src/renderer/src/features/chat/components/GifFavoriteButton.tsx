import type { GiphyItem } from '../api/giphy'
import IconButton from '../../../shared/ui/IconButton'
import { StarIcon, type IconProps } from '../../../shared/ui/icons'

const FilledStar = (props: IconProps): React.JSX.Element => <StarIcon {...props} filled />
const OutlineStar = (props: IconProps): React.JSX.Element => <StarIcon {...props} />

/** Estrela de favoritar por cima do GIF (no seletor e no chat); sempre um botão de verdade, para toque e teclado. */
export default function GifFavoriteButton({
  gif,
  favorite,
  onToggle,
  className = ''
}: {
  gif: GiphyItem
  favorite: boolean
  onToggle: (gif: GiphyItem) => void
  className?: string
}): React.JSX.Element {
  return (
    <IconButton
      icon={favorite ? FilledStar : OutlineStar}
      label={favorite ? 'Tirar dos favoritos' : 'Favoritar GIF'}
      size="sm"
      aria-pressed={favorite}
      onClick={(e) => {
        e.stopPropagation()
        onToggle(gif)
      }}
      className={`on-media bg-black/70! text-white! hover:bg-black/90! ${className}`}
    />
  )
}
