import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import EmojiPickerGrid from '../../emojis/components/EmojiPickerGrid'
import type { PickerDestination } from '../../emojis/hooks/useExternalAccess'
import { useEmotePickerPlacement } from '../hooks/useEmotePickerPlacement'
import { useAnchoredPickerPlacement } from '../hooks/useAnchoredPickerPlacement'
import { useEmotePickerDismiss } from '../hooks/useEmotePickerDismiss'
import { useIsMobile } from '../../navigation/hooks/useIsMobile'

/** Classes comuns; a posição muda conforme a âncora (veja `PLACE_*`). */
const BASE =
  'flex h-[min(26rem,70dvh)] w-[min(24rem,calc(100vw-1rem))] flex-col rounded-xl border border-subtle bg-floating p-3 shadow-2xl max-md:animate-sheet-in max-md:fixed max-md:inset-x-0 max-md:top-auto max-md:bottom-0 max-md:z-50 max-md:w-full max-md:rounded-b-none max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))]'
/** Barra de ações: preso ao canto da linha. */
const PLACE_ROW = 'absolute right-4 top-8 z-30'
/** "+" ao lado dos chips: solto na tela, posicionado pelo estilo (ao lado do botão). */
const PLACE_ANCHORED = 'fixed z-50'

/** A âncora só vale fora do celular: lá o seletor é folha de baixo, na largura toda. */
function useFloatingAnchor(anchor: HTMLElement | null): HTMLElement | null {
  return useIsMobile() ? null : anchor
}

/** O seletor em si: busca e emojis, preso ao canto da linha ou ao lado de `anchor`. */
function EmotePickerPanel({
  anchor,
  destination,
  customs,
  onSelect,
  onClose
}: {
  anchor: HTMLElement | null
  destination?: PickerDestination
  customs?: boolean
  onSelect: (emoji: string) => void
  onClose: () => void
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const floating = useFloatingAnchor(anchor)
  // Perto do fim da lista abre para cima (não fica cortado atrás do campo).
  const rowStyle = useEmotePickerPlacement(ref)
  const anchoredStyle = useAnchoredPickerPlacement(ref, floating)
  useEmotePickerDismiss(ref, anchor, floating !== null, onClose)

  // Fora da linha o seletor não é irmão do botão: leva o foco do teclado para a busca.
  useEffect(() => {
    if (floating) searchRef.current?.focus({ preventScroll: true })
  }, [floating])

  const pick = (emoji: string): void => {
    onSelect(emoji)
    onClose()
    // Teclado: devolve o foco ao botão que abriu (o seletor some).
    if (anchor?.isConnected) anchor.focus()
  }

  return (
    <div
      ref={ref}
      style={anchoredStyle ?? rowStyle}
      onClick={(e) => e.stopPropagation()}
      // Celular: folha de baixo na largura toda (o canto da linha pode estar no fim da tela).
      className={`${anchor ? PLACE_ANCHORED : PLACE_ROW} ${BASE}`}
    >
      <input
        ref={searchRef}
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar emote…"
        aria-label="Buscar emote"
        className="mb-2 w-full rounded-md border border-subtle bg-input px-2.5 py-1 text-ds-xs text-strong max-md:py-2 max-md:text-ds-md placeholder:text-faint outline-none focus:border-brand/50"
      />
      {/* Personalizados e o pack base; a reação leva <:id> no personalizado. */}
      <EmojiPickerGrid search={search} mode="reaction" onPick={pick} destination={destination} customs={customs} />
    </div>
  )
}

/**
 * Seletor de emoji das reações (busca + categorias). Sem `anchor`, posiciona-se
 * no canto da linha (barra de ações); com `anchor` (o "+" ao lado dos chips),
 * abre ao lado desse botão, num portal (o scroll do chat não o corta).
 */
function EmotePickerPopover({
  anchor = null,
  destination,
  customs,
  onSelect,
  onClose
}: {
  /** Botão que abriu o seletor; null = a barra de ações. */
  anchor?: HTMLElement | null
  /** Onde a reação vai: decide o que é de fora e a permissão. Vazio = DM ou grupo. */
  destination?: PickerDestination
  /** Sem os personalizados (onde eles não são aceitos, como nas propostas). */
  customs?: boolean
  onSelect: (emoji: string) => void
  onClose: () => void
}): React.JSX.Element {
  const panel = (
    <EmotePickerPanel anchor={anchor} destination={destination} customs={customs} onSelect={onSelect} onClose={onClose} />
  )
  return anchor ? createPortal(panel, document.body) : panel
}

export default EmotePickerPopover
