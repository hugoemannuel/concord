import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { MessageFavorite } from '../api/messageFavorites'
import { favoriteDestination } from '../lib/favoriteTarget'
import { useMessageFavoritesStore } from '../store/messageFavoritesStore'
import FavoriteItem from '../components/FavoriteItem'
import { useSearchStore } from '../../chat/store/searchStore'
import Button from '../../../shared/ui/Button'
import { StarIcon } from '../../../shared/ui/icons'
import { PinnedListSkeleton } from '../../../shared/ui/skeleton/layouts'

function EmptyState(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-fg/5 text-muted">
        <StarIcon size={24} />
      </span>
      <p className="text-ds-sm font-medium text-normal">Nenhuma mensagem favorita ainda</p>
      <p className="mt-1 max-w-sm text-ds-xs text-muted">
        No menu de uma mensagem, escolha Favoritar para guardar aqui e ver depois.
      </p>
    </div>
  )
}

export function FavoritesBody({
  items,
  loading,
  error,
  onRetry,
  onOpen,
  onRemove
}: {
  items: MessageFavorite[] | null
  loading: boolean
  error: string | null
  onRetry: () => void
  onOpen: (fav: MessageFavorite) => void
  onRemove: (fav: MessageFavorite) => void
}): React.JSX.Element {
  if (error && !items) {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-ds-sm text-secondary">{error}</p>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Tentar de novo
        </Button>
      </div>
    )
  }
  if (!items) return loading ? <PinnedListSkeleton /> : <EmptyState />
  if (items.length === 0) return <EmptyState />
  return (
    <ul className="flex flex-col gap-2">
      {items.map((fav) => (
        <li key={fav.message_id}>
          <FavoriteItem favorite={fav} onOpen={() => onOpen(fav)} onRemove={() => onRemove(fav)} />
        </li>
      ))}
    </ul>
  )
}

/** A lista pessoal de mensagens favoritas (de canais e DMs), da mais recente à mais antiga. */
export default function MessageFavoritesPage(): React.JSX.Element {
  const navigate = useNavigate()
  const items = useMessageFavoritesStore((s) => s.items)
  const loading = useMessageFavoritesStore((s) => s.loadingList)
  const error = useMessageFavoritesStore((s) => s.listError)
  const loadList = useMessageFavoritesStore((s) => s.loadList)

  useEffect(() => {
    void loadList()
  }, [loadList])

  const open = (fav: MessageFavorite): void => {
    const dest = favoriteDestination(fav)
    if (!dest) return
    navigate(dest.path)
    useSearchStore.getState().requestJump(dest.room, fav.message_id)
  }

  const remove = (fav: MessageFavorite): void => {
    void useMessageFavoritesStore.getState().toggle(fav.message_id)
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-primary text-strong backdrop-blur-2xl">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-subtle px-4">
        <StarIcon size={20} className="text-warning" />
        <h1 className="text-ds-md font-semibold">Favoritas</h1>
        {items && items.length > 0 && (
          <span className="rounded bg-fg/10 px-1.5 py-0.5 text-ds-xs font-medium text-secondary">
            {items.length}
          </span>
        )}
      </header>
      <main className="flex-1 overflow-y-auto p-3 sm:p-4">
        <div className="mx-auto max-w-2xl">
          <FavoritesBody
            items={items}
            loading={loading}
            error={error}
            onRetry={() => void loadList()}
            onOpen={open}
            onRemove={remove}
          />
        </div>
      </main>
    </div>
  )
}
