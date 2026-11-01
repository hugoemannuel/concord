import { useState } from 'react'
import type { Message } from '../api/messages'
import { useAuthStore } from '../../auth/store/authStore'
import { useFriendStore } from '../../friends/store/friendStore'
import { useUserLook } from '../../profile/store/profileStore'
import { profileCardHandler } from '../../profile/store/profileCardStore'
import { userMenuHandler } from '../../profile/store/userMenuStore'
import { useServerMemberColor, useServerNickname } from '../../servers/hooks/useServerNames'
import { serverDisplayName } from '../../servers/lib/serverNames'
import MusicMessage from '../../music/components/MusicMessage'
import { isMaestroMessageKind } from '../../music/lib/music'
import { messageMentionsMe, type MentionLabels } from '../lib/mentions'
import {
  authorFallbackName,
  hasReplyReference,
  messageBarActions,
  messageRowClass
} from '../lib/messageItem'
import { useMessageActionsState, type MessageActionsState } from '../hooks/useMessageActionsState'
import SystemMessage from './SystemMessage'
import EmotePickerPopover from './EmotePickerPopover'
import MessageActionsBar from './MessageActionsBar'
import ReactionChips from './ReactionChips'
import {
  BlockedMessageNotice,
  MessageContent,
  MessageGutter,
  MessageHeader,
  MessageReplyReference
} from './MessageParts'

export interface MessageItemProps {
  /** Continuação de uma sequência do mesmo autor: só o texto, sem avatar e nome. */
  grouped?: boolean
  canPin?: boolean
  onTogglePin?: () => void
  message: Message
  /** Canal de servidor: autor e resposta com o apelido daquele servidor. */
  serverId?: string
  isHighlighted: boolean
  /** Nome mostrado nos chips de menção (@nick -> apelido/nome). */
  mentionLabels?: MentionLabels
  onReply: () => void
  onReact: (emoji: string) => void
  onJumpToMessage: (messageId: string) => void
  onDelete: () => void
  onVote: (answerIds: number[]) => Promise<void>
  onEndPoll: () => Promise<void>
  onCopy: () => void
  onStartEdit: () => void
  onSaveEdit: (draft: string) => void
  onCancelEdit: () => void
  /** Esta mensagem está aberta na edição. */
  isEditing: boolean
  savingEdit: boolean
  /** ADD_REACTIONS no canal. */
  canReact: boolean
  /** MANAGE_MESSAGES no canal: apaga mensagem de outros e encerra enquete. */
  canModerate: boolean
  /** Em canais de sistema (#avisos e #musica) nenhuma mensagem pode ser excluída. */
  canDelete?: boolean
}

/** Tem texto selecionado que pega (ao menos em parte) este elemento? */
function selectionTouches(el: Element): boolean {
  const selection = window.getSelection()
  return Boolean(selection && !selection.isCollapsed && selection.containsNode(el, true))
}

/**
 * Botão direito na linha: sobre texto selecionado desta linha ou link fica o
 * menu do navegador/app (copiar, copiar link); sobre anexo (imagem/vídeo)
 * também não abre o do autor; no resto da linha, o menu do autor.
 */
function authorContextMenu(
  onAuthorMenu: ((e: React.MouseEvent) => void) | undefined
): (e: React.MouseEvent<HTMLDivElement>) => void {
  return (e) => {
    if (selectionTouches(e.currentTarget)) return
    if ((e.target as Element).closest('a, [data-message-media]')) return
    onAuthorMenu?.(e)
  }
}

/** Segurar o dedo abre o "Mais" da mensagem; o botão direito, o menu do autor. */
function rowContextMenu(
  actions: MessageActionsState,
  onAuthorMenu: ((e: React.MouseEvent) => void) | undefined
): (e: React.MouseEvent<HTMLDivElement>) => void {
  const authorMenu = authorContextMenu(onAuthorMenu)
  return (e) => {
    if (!actions.touchMenu(e)) authorMenu(e)
  }
}

interface MessageAuthorView {
  me: ReturnType<typeof useAuthStore.getState>['user']
  isMine: boolean
  avatarUrl: string | null
  nickname?: string
  name: string
  nameColor?: string
  blocked: boolean
  openProfile: (e: React.MouseEvent<HTMLElement>) => void
  onMenu: ((e: React.MouseEvent) => void) | undefined
}

/** Autor da mensagem: nome (apelido no servidor), cor, avatar e os atalhos de perfil. */
function useMessageAuthor(message: Message, serverId: string | undefined): MessageAuthorView {
  const me = useAuthStore((s) => s.user)
  const isMine = message.author_id === me?.id
  const look = useUserLook(message.author_id, {
    name: authorFallbackName(message, me),
    avatarUrl: message.author?.avatar_url
  })
  const nickname = useServerNickname(serverId, message.author_id)
  const name = serverDisplayName({ nickname }, { display_name: look.name })
  const nameColor = useServerMemberColor(serverId, message.author_id)
  const blocked = useFriendStore(
    (s) => !isMine && s.blocked.some((u) => u.id === message.author_id)
  )
  const username = message.author?.username
  return {
    me,
    isMine,
    avatarUrl: look.avatarUrl,
    nickname,
    name,
    nameColor,
    blocked,
    openProfile: profileCardHandler(message.author_id, name, username, 'right'),
    onMenu: userMenuHandler(message.author_id, name, me?.id, username)
  }
}

/** Barra de ações (ao passar o mouse) e o seletor de emoji das reações. */
function MessageActions({
  item,
  author,
  actions
}: {
  item: MessageItemProps
  author: MessageAuthorView
  actions: MessageActionsState
}): React.JSX.Element {
  const { message } = item
  const bar = messageBarActions(
    {
      message,
      meId: author.me?.id,
      isEditing: item.isEditing,
      canDelete: item.canDelete ?? true,
      canModerate: item.canModerate
    },
    { onCopy: item.onCopy, onStartEdit: item.onStartEdit, onDelete: item.onDelete }
  )
  return (
    <>
      {actions.showBar && (
        <MessageActionsBar
          canReact={item.canReact}
          onReact={item.onReact}
          onTogglePicker={() => actions.togglePicker()}
          onReply={item.onReply}
          onCopy={bar.onCopy}
          onEdit={bar.onEdit}
          canPin={item.canPin}
          isPinned={Boolean(message.pinned_at)}
          onTogglePin={item.onTogglePin}
          onDelete={bar.onDelete}
          deleteTitle={bar.deleteTitle}
          menuOpen={actions.menuOpen}
          onMenuOpenChange={actions.setMenuOpen}
        />
      )}
      {actions.pickerOpen && item.canReact && (
        <EmotePickerPopover
          anchor={actions.pickerAnchor}
          onSelect={item.onReact}
          onClose={actions.closePicker}
        />
      )}
    </>
  )
}

/** A linha de uma mensagem comum (nem de sistema, nem escondida por bloqueio). */
function MessageRow({
  item,
  author,
  actions
}: {
  item: MessageItemProps
  author: MessageAuthorView
  actions: MessageActionsState
}): React.JSX.Element {
  const { message } = item
  // Autor bloqueado e revelado: sem agrupar, para a linha não ficar sem nome.
  const compact = Boolean(item.grouped) && !author.blocked
  return (
    <div
      id={`msg-${message.id}`}
      data-message-row=""
      className={messageRowClass(
        compact,
        messageMentionsMe(message, author.me),
        item.isHighlighted
      )}
      {...actions.rowProps}
      onContextMenu={rowContextMenu(actions, author.onMenu)}
    >
      {hasReplyReference(message) && (
        <MessageReplyReference
          message={message}
          serverId={item.serverId}
          onJumpToMessage={item.onJumpToMessage}
        />
      )}

      <div className="flex gap-3">
        <MessageGutter
          compact={compact}
          message={message}
          name={author.name}
          avatarUrl={author.avatarUrl}
          onOpenProfile={author.openProfile}
        />
        <div className="min-w-0 flex-1">
          <MessageHeader
            compact={compact}
            message={message}
            name={author.name}
            nickname={author.nickname}
            nameColor={author.nameColor}
            onOpenProfile={author.openProfile}
          />
          <MessageContent
            message={message}
            mentionLabels={item.mentionLabels}
            isEditing={item.isEditing}
            savingEdit={item.savingEdit}
            onSaveEdit={item.onSaveEdit}
            onCancelEdit={item.onCancelEdit}
            canEndPoll={author.isMine || item.canModerate}
            onVote={item.onVote}
            onEndPoll={item.onEndPoll}
          />
          <ReactionChips
            reactions={message.reactions ?? []}
            meId={author.me?.id}
            canReact={item.canReact}
            serverId={item.serverId}
            pickerAnchor={actions.pickerAnchor}
            onReact={item.onReact}
            onOpenPicker={actions.togglePicker}
          />
        </div>

        <MessageActions item={item} author={author} actions={actions} />
      </div>
    </div>
  )
}

/** Uma mensagem do chat: de sistema, escondida (autor bloqueado) ou a linha comum. */
function MessageItem(props: MessageItemProps): React.JSX.Element {
  const { message } = props
  const author = useMessageAuthor(message, props.serverId)
  const actions = useMessageActionsState()
  const [revealBlocked, setRevealBlocked] = useState(false)

  if (isMaestroMessageKind(message.system_kind)) return <MusicMessage message={message} />
  if (message.system_kind) return <SystemMessage message={message} />
  if (author.blocked && !revealBlocked) {
    return <BlockedMessageNotice messageId={message.id} onReveal={() => setRevealBlocked(true)} />
  }
  return <MessageRow item={props} author={author} actions={actions} />
}

export default MessageItem
