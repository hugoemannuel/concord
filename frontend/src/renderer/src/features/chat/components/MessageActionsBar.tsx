import { useState } from 'react'
import { messageMenuGroups, quickReactions, type MessageMenuAction } from '../lib/messageMenu'
import { AddReactionIcon, MoreIcon, ReplyIcon } from '../../../shared/ui/icons'
import MessageMoreMenu from './MessageMoreMenu'

const iconButton =
  'flex h-8 w-8 cursor-pointer items-center justify-center rounded text-secondary transition-colors hover:bg-fg/10 hover:text-strong focus-ring'

interface MessageActionsBarProps {
  canReact: boolean
  onReact: (emoji: string) => void
  onTogglePicker: () => void
  onReply: () => void
  /** Abre o seletor de destino; ausente = a mensagem não pode ser encaminhada. */
  onForward?: () => void
  onCopy?: () => void
  onEdit?: () => void
  canPin?: boolean
  isPinned?: boolean
  onTogglePin?: () => void
  /** Na lista pessoal de favoritas. */
  isFavorite?: boolean
  onToggleFavorite?: () => void
  onDelete?: () => void
  deleteTitle?: string
  /** Menu "Mais" controlado por fora (a barra fica na tela enquanto ele está aberto). */
  menuOpen?: boolean
  onMenuOpenChange?: (open: boolean) => void
}

/** Roda o handler do item escolhido no "Mais". */
function runMenuAction(action: MessageMenuAction, props: MessageActionsBarProps): void {
  const handlers: Record<MessageMenuAction, (() => void) | undefined> = {
    react: props.onTogglePicker,
    edit: props.onEdit,
    reply: props.onReply,
    forward: props.onForward,
    pin: props.onTogglePin,
    unpin: props.onTogglePin,
    favorite: props.onToggleFavorite,
    unfavorite: props.onToggleFavorite,
    copy: props.onCopy,
    delete: props.onDelete
  }
  handlers[action]?.()
}

/** Itens do "Mais" pelo que veio: cada ação só entra quando o handler vem. */
function menuGroups(props: MessageActionsBarProps): ReturnType<typeof messageMenuGroups> {
  return messageMenuGroups({
    canReact: props.canReact,
    canEdit: Boolean(props.onEdit),
    canForward: Boolean(props.onForward),
    canPin: Boolean(props.canPin && props.onTogglePin),
    isPinned: Boolean(props.isPinned),
    canFavorite: Boolean(props.onToggleFavorite),
    isFavorite: Boolean(props.isFavorite),
    canCopy: Boolean(props.onCopy),
    canDelete: Boolean(props.onDelete),
    deleteLabel: props.deleteTitle ?? 'Excluir mensagem'
  })
}

/** Reações rápidas, a divisória e o "Adicionar reação" (só com permissão de reagir). */
function ReactionButtons({
  onReact,
  onTogglePicker
}: {
  onReact: (emoji: string) => void
  onTogglePicker: () => void
}): React.JSX.Element {
  return (
    <>
      {quickReactions().map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onReact(emoji)}
          title={`Reagir com ${emoji}`}
          aria-label={`Reagir com ${emoji}`}
          className={`${iconButton} text-ds-lg leading-none hover:scale-110`}
        >
          {emoji}
        </button>
      ))}
      <div role="separator" aria-orientation="vertical" className="mx-0.5 h-5 w-px bg-fg/15" />
      <button
        type="button"
        // Sem repassar o evento: a barra abre o seletor no canto da linha, sem âncora.
        onClick={() => onTogglePicker()}
        title="Adicionar reação"
        aria-label="Adicionar reação"
        className={iconButton}
      >
        <AddReactionIcon className="h-5 w-5" />
      </button>
    </>
  )
}

/**
 * Barra compacta de ícones sobre a mensagem (como no Discord): 3 reações
 * rápidas, adicionar reação, responder e "Mais", que abre o menu com as
 * outras ações (editar, encaminhar, fixar, favoritar, copiar, excluir...). Cada ação do menu só
 * aparece quando o handler vem.
 */
function MessageActionsBar(props: MessageActionsBarProps): React.JSX.Element {
  // O "…" vira a âncora do menu (estado, não ref: o render lê).
  const [moreButton, setMoreButton] = useState<HTMLButtonElement | null>(null)
  const [ownMenuOpen, setOwnMenuOpen] = useState(false)
  const menuOpen = props.menuOpen ?? ownMenuOpen
  const setMenuOpen = props.onMenuOpenChange ?? setOwnMenuOpen

  return (
    <div
      role="toolbar"
      aria-label="Ações da mensagem"
      className="absolute -top-4 right-4 z-20 flex items-center gap-0.5 rounded-lg border border-subtle bg-floating p-0.5 shadow-lg"
    >
      {props.canReact && (
        <ReactionButtons onReact={props.onReact} onTogglePicker={props.onTogglePicker} />
      )}
      <button
        type="button"
        onClick={props.onReply}
        title="Responder"
        aria-label="Responder"
        className={iconButton}
      >
        <ReplyIcon className="h-5 w-5" />
      </button>
      <button
        ref={setMoreButton}
        type="button"
        onClick={() => setMenuOpen(!menuOpen)}
        title="Mais"
        aria-label="Mais"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className={`${iconButton} ${menuOpen ? 'bg-fg/10 text-strong' : ''}`}
      >
        <MoreIcon className="h-5 w-5" />
      </button>
      {menuOpen && moreButton && (
        <MessageMoreMenu
          anchor={moreButton}
          groups={menuGroups(props)}
          onAction={(action) => runMenuAction(action, props)}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </div>
  )
}

export default MessageActionsBar
