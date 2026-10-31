import { useEffect, useRef, useState } from 'react'
import type { GiphyItem } from '../api/giphy'
import { useGifSearch } from '../hooks/useGifSearch'
import { useGifFavorites } from '../hooks/useGifFavorites'
import type { ServerSticker } from '../api/stickers'
import { useStickerStore } from '../store/stickerStore'
import StickerUploadModal from './StickerUploadModal'
import StickersTab from './StickersTab'
import EmojisTab from './EmojisTab'
import GifsTab from './GifsTab'
import { GifIcon, SmileyIcon, StickerIcon, type IconProps } from '../../../shared/ui/icons'
import EmojiUploadModal from '../../emojis/components/EmojiUploadModal'
import { useMediaPickerDismiss } from '../hooks/useMediaPickerDismiss'

type TabType = 'emojis' | 'gifs' | 'stickers'

const TABS: {
  id: TabType
  icon: React.ComponentType<IconProps>
  label: string
  placeholder: string
}[] = [
  { id: 'emojis', icon: SmileyIcon, label: 'Emojis', placeholder: 'Buscar emoji…' },
  { id: 'gifs', icon: GifIcon, label: 'GIFs', placeholder: 'Buscar GIFs no GIPHY…' },
  { id: 'stickers', icon: StickerIcon, label: 'Figurinhas', placeholder: 'Filtrar figurinhas…' }
]

interface UnifiedMediaPickerPopoverProps {
  serverId?: string | null
  onSelectEmoji: (emoji: string) => void
  onSelectGif: (gif: GiphyItem) => void
  onSelectSticker: (sticker: ServerSticker) => void
  onClose: () => void
}

export default function UnifiedMediaPickerPopover({
  serverId,
  onSelectEmoji,
  onSelectGif,
  onSelectSticker,
  onClose
}: UnifiedMediaPickerPopoverProps): React.JSX.Element {
  const [tab, setTab] = useState<TabType>('emojis')
  const [search, setSearch] = useState('')
  // Modal de envio aberto por cima (figurinha ou emoji do servidor).
  const [upload, setUpload] = useState<'stickers' | 'emojis' | null>(null)

  const { gifs, loading: loadingGifs } = useGifSearch(tab === 'gifs', search)
  const { favorites: favoriteGifs, toggle: toggleFavoriteGif } = useGifFavorites(tab === 'gifs')

  // Stickers
  const loadStickers = useStickerStore((s) => s.loadStickers)

  const ref = useRef<HTMLDivElement>(null)

  useMediaPickerDismiss(ref, upload !== null, onClose)

  // Load stickers on mount if serverId present
  useEffect(() => {
    if (serverId) {
      loadStickers(serverId)
    }
  }, [serverId, loadStickers])

  return (
    <>
      <div
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-14 right-2 z-40 flex h-96 w-80 flex-col rounded-xl border border-white/10 bg-floating p-3 shadow-2xl backdrop-blur-xl"
      >
        {/* Abas Superiores estilo WhatsApp */}
        <div className="mb-2 flex items-center justify-around border-b border-white/10 pb-2 text-ds-xs font-medium text-muted">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id)
                setSearch('')
              }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors cursor-pointer ${
                tab === t.id
                  ? 'bg-white/10 text-white font-semibold'
                  : 'hover:text-white hover:bg-white/5'
              }`}
            >
              <t.icon size={16} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Input de Busca */}
        <div className="relative mb-2 shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={TABS.find((t) => t.id === tab)?.placeholder}
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-ds-xs text-white placeholder:text-faint outline-none focus:border-brand/50"
          />
        </div>

        {/* Conteúdo da Aba */}
        <div className="flex-1 overflow-y-auto pr-1">
          {tab === 'emojis' && (
            <EmojisTab
              serverId={serverId}
              search={search}
              onAdd={() => setUpload('emojis')}
              onSelect={(emoji) => {
                onSelectEmoji(emoji)
                onClose()
              }}
            />
          )}

          {tab === 'gifs' && (
            <GifsTab
              gifs={gifs}
              loading={loadingGifs}
              favorites={favoriteGifs}
              searching={search.trim() !== ''}
              onToggleFavorite={toggleFavoriteGif}
              onSelect={(gif) => {
                onSelectGif(gif)
                onClose()
              }}
            />
          )}

          {tab === 'stickers' && (
            <div>
              <StickersTab
                serverId={serverId}
                search={search}
                onAdd={() => setUpload('stickers')}
                onSelectSticker={(selected) => {
                  onSelectSticker(selected)
                  onClose()
                }}
              />
            </div>
          )}
        </div>

        {/* Rodapé Giphy se na aba de GIFs */}
        {tab === 'gifs' && (
          <div className="mt-2 flex items-center justify-center border-t border-white/5 pt-1.5 text-ds-xxs text-faint tracking-wider">
            Powered by GIPHY
          </div>
        )}
      </div>

      {serverId && upload === 'stickers' && (
        <StickerUploadModal open serverId={serverId} onClose={() => setUpload(null)} />
      )}
      {serverId && upload === 'emojis' && (
        <EmojiUploadModal serverId={serverId} onClose={() => setUpload(null)} />
      )}
    </>
  )
}
