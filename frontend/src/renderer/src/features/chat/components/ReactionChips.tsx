import { useCallback, useEffect, useRef, useState } from 'react'
import ReactionTooltip from './ReactionTooltip'
import { AddReactionIcon } from '../../../shared/ui/icons'
import ReactionEmoji, { useReactionLabel } from '../../emojis/components/ReactionEmoji'

export interface ReactionSummary {
  emoji: string
  count: number
  user_ids: string[]
}

/** Espera antes de abrir: não abre o popover só de passar por cima do chip. */
const HOVER_OPEN_MS = 120
/** Tolerância para o mouse sair do chip e entrar no popover. */
const HOVER_CLOSE_MS = 120

/** Chip do popover aberto: o emoji e o chip que serve de âncora. */
interface HoveredReaction {
  emoji: string
  anchor: HTMLElement
}

/** Pílula de uma reação, no tamanho do Discord: emoji de 20px e a contagem. */
function ReactionChip({
  reaction,
  meId,
  canReact,
  onToggle,
  onMouseEnter,
  onMouseLeave
}: {
  reaction: ReactionSummary
  meId: string | undefined
  canReact: boolean
  /** Põe ou tira a minha reação (só chega aqui quando é permitido). */
  onToggle: () => void
  onMouseEnter: (anchor: HTMLElement) => void
  onMouseLeave: () => void
}): React.JSX.Element {
  const meReacted = meId ? reaction.user_ids.includes(meId) : false
  // Sem permissão ainda dá para tirar a própria reação.
  const locked = !canReact && !meReacted
  const label = `${useReactionLabel(reaction.emoji)}: ${reaction.count} ${reaction.count === 1 ? 'reação' : 'reações'}`
  return (
    <button
      type="button"
      // Sem `disabled`: botão desabilitado não dispara hover, e o popover
      // de "quem reagiu" precisa abrir também nesse chip.
      aria-disabled={locked || undefined}
      aria-pressed={meReacted}
      aria-label={label}
      onClick={() => {
        if (!locked) onToggle()
      }}
      onMouseEnter={(e) => onMouseEnter(e.currentTarget)}
      onMouseLeave={onMouseLeave}
      className={`inline-flex h-7 items-center gap-1.5 rounded-lg border px-1.5 transition-colors focus-ring ${
        locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
      } ${
        meReacted
          ? 'border-brand bg-brand/15 hover:bg-brand/25'
          : 'border-transparent bg-fg/5 hover:border-strong hover:bg-fg/10'
      }`}
    >
      {/* Emoji (ou imagem de emoji) sempre em 20px. */}
      <span className="flex h-5 min-w-5 items-center justify-center text-ds-lg leading-none [&>img]:h-5 [&>img]:w-5 [&>img]:object-contain">
        <ReactionEmoji emoji={reaction.emoji} />
      </span>
      <span
        className={`min-w-[9px] text-ds-sm font-semibold tabular-nums ${
          meReacted ? 'text-brand' : 'text-secondary'
        }`}
      >
        {reaction.count}
      </span>
    </button>
  )
}

/** Só aparece com o mouse na mensagem (hover), no foco do teclado e sempre no toque. */
const ADD_HIDDEN_UNTIL_HOVER =
  '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100'

/**
 * "Adicionar reação" no fim das pílulas: aparece ao passar o mouse na
 * mensagem (como no Discord), no foco do teclado e sempre no toque. Com o
 * seletor aberto por ele (`active`) fica visível mesmo com o mouse fora da
 * mensagem, que é onde o mouse está quando usa o seletor.
 */
function AddReactionChip({
  active,
  onClick
}: {
  /** O seletor de emoji aberto por este botão está aberto. */
  active: boolean
  /** Recebe o próprio botão: é nele que o seletor de emoji se ancora. */
  onClick: (button: HTMLElement) => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={(e) => onClick(e.currentTarget)}
      title="Adicionar reação"
      aria-label="Adicionar reação"
      aria-expanded={active}
      className={`inline-flex h-7 w-9 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-fg/5 text-muted transition-colors hover:border-strong hover:bg-fg/10 hover:text-strong focus-ring ${
        active ? 'opacity-100' : ADD_HIDDEN_UNTIL_HOVER
      }`}
    >
      <AddReactionIcon className="h-5 w-5" />
    </button>
  )
}

/** Chips de reação sob a mensagem, com o "+" para abrir o seletor de emoji. */
function ReactionChips({
  reactions,
  meId,
  canReact,
  serverId,
  pickerAnchor,
  onReact,
  onOpenPicker
}: {
  reactions: ReactionSummary[]
  meId: string | undefined
  /** Sem permissão ainda dá para tirar a própria reação. */
  canReact: boolean
  /** Canal de servidor: o "quem reagiu" usa o apelido de lá. */
  serverId?: string
  /**
   * Botão que abriu o seletor de emoji aberto agora (null = fechado ou aberto
   * pela barra de ações). Só o "+" abre ancorado, então não-nulo = foi ele.
   */
  pickerAnchor: HTMLElement | null
  onReact: (emoji: string) => void
  /** Abre o seletor de emoji ancorado no botão "+" (`anchor`). */
  onOpenPicker: (anchor: HTMLElement) => void
}): React.JSX.Element | null {
  const [hovered, setHovered] = useState<HoveredReaction | null>(null)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelOpen = useCallback(() => {
    if (openTimer.current !== null) {
      clearTimeout(openTimer.current)
      openTimer.current = null
    }
  }, [])

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }, [])

  const closeTooltip = useCallback(() => setHovered(null), [])

  const openTooltip = useCallback(
    (emoji: string, anchor: HTMLElement) => {
      cancelClose()
      cancelOpen()
      openTimer.current = setTimeout(() => {
        openTimer.current = null
        setHovered({ emoji, anchor })
      }, HOVER_OPEN_MS)
    },
    [cancelClose, cancelOpen]
  )

  // O mouse pode sair do chip e entrar no popover: fecha só depois de um instante.
  const scheduleClose = useCallback(() => {
    cancelOpen()
    cancelClose()
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null
      closeTooltip()
    }, HOVER_CLOSE_MS)
  }, [cancelOpen, cancelClose, closeTooltip])

  useEffect(
    () => () => {
      cancelOpen()
      cancelClose()
    },
    [cancelOpen, cancelClose]
  )

  if (reactions.length === 0) return null

  const hoveredReaction = hovered
    ? reactions.find((reaction) => reaction.emoji === hovered.emoji)
    : undefined

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {reactions.map((reaction) => (
        <ReactionChip
          key={reaction.emoji}
          reaction={reaction}
          meId={meId}
          canReact={canReact}
          onToggle={() => {
            onReact(reaction.emoji)
            // A própria última reação: o chip some, então o popover também.
            if (reaction.count <= 1 && meId && reaction.user_ids.includes(meId)) closeTooltip()
          }}
          onMouseEnter={(anchor) => openTooltip(reaction.emoji, anchor)}
          onMouseLeave={scheduleClose}
        />
      ))}
      {canReact && <AddReactionChip active={pickerAnchor !== null} onClick={onOpenPicker} />}
      {hovered && hoveredReaction && hoveredReaction.user_ids.length > 0 && (
        <ReactionTooltip
          emoji={hoveredReaction.emoji}
          userIds={hoveredReaction.user_ids}
          anchor={hovered.anchor}
          serverId={serverId}
          meId={meId}
          onClose={closeTooltip}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        />
      )}
    </div>
  )
}

export default ReactionChips
