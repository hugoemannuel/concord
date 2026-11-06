import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../../auth/store/authStore'
import { useChatStore } from '../store/chatStore'
import type { Message } from '../api/messages'
import { showToast } from '../../../shared/store/toastStore'
import { useMusicStore } from '../../music/store/musicStore'
import { useServerNicknames } from '../../servers/hooks/useServerNames'
import { lastEditableMessage } from '../lib/messageEdit'
import { isGroupedWithPrevious } from '../lib/messageGrouping'
import MessageItem from './MessageItem'
import MessageDayDivider from './MessageDayDivider'
import ChatComposer from './ChatComposer'
import { copyText } from '../../../shared/lib/clipboard'
import CreatePollModal from './CreatePollModal'
import { usePinStore } from '../store/pinStore'
import { useAttachmentDraft } from '../hooks/useAttachmentDraft'
import { useRoomState } from '../hooks/useRoomState'
import { useMessageEditing } from '../hooks/useMessageEditing'
import { useFileDropZone } from '../hooks/useFileDropZone'
import { useMentionLabels } from '../hooks/useMentionLabels'
import TypingIndicator from './TypingIndicator'
import type { ReplyState } from '../lib/sendFailure'
import {
  ATTACH_DENIED,
  DIRECT_CHAT_PERMISSIONS,
  type ChatPermissions
} from '../lib/chatPermissions'
import { actionErrorMessage } from '../../servers/lib/permissionErrors'
import { JUMP_HIGHLIGHT_MS } from '../lib/scrollAnchor'
import { useStickToBottom } from '../hooks/useStickToBottom'
import { useJumpToPresent } from '../hooks/useJumpToPresent'
import JumpToPresentButton from './JumpToPresentButton'
import { useOlderMessages } from '../hooks/useOlderMessages'
import { useInfiniteScrollOlder } from '../hooks/useInfiniteScrollOlder'
import { useAutoFocusComposer } from '../hooks/useAutoFocusComposer'
import OlderMessagesLoader from './OlderMessagesLoader'
import PinnedMessageBar from './PinnedMessageBar'
import {
  DropOverlay,
  EmptyRoomNotice,
  MessageListTail,
  RoomLoadingGate
} from './MessageListStates'
import { useRoomMessages } from '../hooks/useRoomMessages'
import { useChannelPins } from '../hooks/useChannelPins'
import { useJumpRequests } from '../hooks/useJumpRequests'
import { useReactToMessage } from '../hooks/useReactToMessage'
import { composerDisabledReason, inRoom, messageAuthorName } from '../lib/chatPaneView'

const NO_MENTIONABLE: Mentionable[] = []

export interface Mentionable {
  username: string
  display_name: string
  /** Apelido no servidor (só em canal de servidor). */
  nickname?: string | null
}

interface ChatPaneProps {
  room: string
  /**
   * Canal de servidor: os nomes saem com o apelido de cada um naquele
   * servidor. Sem isso (DM, grupo), vale o nome de exibição.
   */
  serverId?: string
  placeholder?: string
  /** Quem pode ser marcado com @ (membros do servidor, ou a pessoa da DM). */
  mentionable?: Mentionable[]
  /** Sugere @all/@here (canal de servidor, só dono e moderadores). */
  canMentionEveryone?: boolean
  /** Troca o campo de mensagem por este aviso (ex.: DM com alguém bloqueado). */
  disabledReason?: string
  /** O que a pessoa pode neste canal (cargos). Sem isso (DM), vale o padrão do chat. */
  permissions?: ChatPermissions
  /** Se falso (ex.: canais de sistema #avisos e #musica), esconde a ação de excluir mensagens. */
  canDeleteMessages?: boolean
}

function ChatPane({
  room,
  serverId,
  placeholder = 'Digite sua mensagem',
  mentionable = NO_MENTIONABLE,
  canMentionEveryone = false,
  disabledReason: disabledReasonProp,
  permissions = DIRECT_CHAT_PERMISSIONS,
  canDeleteMessages = true
}: ChatPaneProps): React.JSX.Element {
  // Sem SEND_MESSAGES o campo de mensagem dá lugar ao aviso.
  const disabledReason = composerDisabledReason(disabledReasonProp, permissions)
  const { messages, hasMore, loading, pendingCount } = useRoomMessages(room)
  const openRoom = useChatStore((s) => s.openRoom)
  const deleteFromRoom = useChatStore((s) => s.deleteFromRoom)
  const reactToMessage = useReactToMessage(room)
  const createPollInRoom = useChatStore((s) => s.createPollInRoom)
  const votePollInRoom = useChatStore((s) => s.votePollInRoom)
  const endPollInRoom = useChatStore((s) => s.endPollInRoom)
  const [pollOpen, setPollOpen] = useRoomState(room, false)
  const openPoll = useCallback(() => setPollOpen(true), [setPollOpen])
  const meId = useAuthStore((s) => s.user?.id)

  const [replyState, setReplyState] = useState<ReplyState | null>(null)
  const replyingTo = inRoom(replyState, room, 'message')
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const highlightTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(highlightTimer.current), [])
  const inputRef = useRef<HTMLInputElement>(null)
  useAutoFocusComposer({ room, inputRef, canSend: !disabledReason })
  const { drafts, addFiles: addDraftFiles, remove: removeAttachment } = useAttachmentDraft(room)
  /** Sem ATTACH_FILES, arrastar, colar ou escolher arquivos só avisa. */
  const addFiles = (files: File[]): void => {
    if (files.length === 0) return
    if (!permissions.canAttach) {
      showToast.error(ATTACH_DENIED)
      return
    }
    addDraftFiles(files)
  }
  const drop = useFileDropZone(addFiles)
  // Sala atual, para um envio que termina depois da troca de sala não limpar
  // o campo da sala nova.
  const roomRef = useRef(room)
  useEffect(() => {
    roomRef.current = room
  }, [room])
  const { editingId, savingEdit, startEdit, closeEdit, saveEdit } = useMessageEditing({
    room,
    roomRef,
    inputRef
  })
  const nicknames = useServerNicknames(serverId)
  const labels = useMentionLabels(mentionable, messages, nicknames)

  const ephemeralCount = useMusicStore((s) => s.ephemeral.length)
  // As pendentes ("enviando…") contam: a própria mensagem aparece embaixo.
  const total = messages.length + ephemeralCount + pendingCount
  const stickToBottom = useRef(true)
  const { scrollRef, contentRef, bottomRef, onScroll } = useStickToBottom({
    room,
    loading,
    total,
    stickToBottom
  })
  const jump = useJumpToPresent({ room, messages, selfId: meId })

  useEffect(() => {
    stickToBottom.current = true
    void openRoom(room)
    return () => {
      useChatStore.getState().closeRoom(room)
    }
  }, [room, openRoom])

  const { loadingOlder, loadOlder, loadOlderUntil } = useOlderMessages({
    room,
    messages,
    scrollRef,
    onLeaveBottom: () => {
      stickToBottom.current = false
    }
  })
  const olderSentinelRef = useInfiniteScrollOlder({
    scrollRef,
    hasMore,
    loading,
    resetKey: `${room}:${messages[0]?.id}`,
    onReachTop: () => void loadOlder()
  })

  const followBottom = (): void => {
    stickToBottom.current = true
  }

  const handleScroll = (e: React.UIEvent<HTMLDivElement>): void => {
    onScroll(e.currentTarget)
    jump.onScroll(e.currentTarget)
  }

  // ↑ no campo vazio edita a sua última mensagem (como no Discord).
  const editLast = (): boolean => {
    const last = lastEditableMessage(messages, meId)
    if (last) startEdit(last.id)
    return last !== null
  }

  const handleDelete = async (messageId: string): Promise<void> => {
    try {
      await deleteFromRoom(room, messageId)
      if (replyingTo?.id === messageId) {
        setReplyState(null)
      }
    } catch (err) {
      showToast.error(actionErrorMessage(err, 'Falha ao excluir mensagem.'))
    }
  }

  const handleStartReply = (message: Message): void => {
    setReplyState({ room, message })
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const showMessage = (el: HTMLElement, messageId: string): void => {
    stickToBottom.current = false
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Zera antes: pular de novo para a mesma mensagem reinicia o pulso.
    window.clearTimeout(highlightTimer.current)
    setHighlightedId(null)
    requestAnimationFrame(() => setHighlightedId(messageId))
    highlightTimer.current = window.setTimeout(() => {
      setHighlightedId((current) => (current === messageId ? null : current))
    }, JUMP_HIGHLIGHT_MS + 100)
  }

  // Mensagem fora da tela (resposta antiga, resultado da busca): carrega as
  // páginas antigas até ela, com a mesma âncora do scroll infinito (a tela
  // não pula enquanto carrega), e então rola até ela.
  const shownMessage = (messageId: string): HTMLElement | null => {
    const node = document.getElementById(`msg-${messageId}`)
    return node && scrollRef.current?.contains(node) ? node : null
  }

  const handleJumpToMessage = async (messageId: string): Promise<void> => {
    const el = shownMessage(messageId)
    if (el) {
      showMessage(el, messageId)
      return
    }
    const startedRoom = room
    const found = await loadOlderUntil(messageId)
    if (roomRef.current === startedRoom) showAfterLoading(messageId, found)
  }

  const showAfterLoading = (messageId: string, found: boolean): void => {
    if (!found) {
      showToast.info('Não encontrei essa mensagem: ela pode ter sido apagada ou ser antiga demais.')
      return
    }
    // Espera o React desenhar a página que chegou.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const node = shownMessage(messageId)
        if (node) showMessage(node, messageId)
      })
    )
  }

  // Busca e evento concord:jump-to-message: pula quando a sala já carregou.
  useJumpRequests({
    room,
    loading,
    onJump: (messageId) => void handleJumpToMessage(messageId)
  })

  const { channelId, pins } = useChannelPins(room)
  const isChannel = channelId !== null

  const handleTogglePin = async (message: Message): Promise<void> => {
    if (!channelId) return
    if (message.pinned_at) {
      await usePinStore.getState().unpin(channelId, message.id)
    } else {
      await usePinStore.getState().pin(channelId, message.id)
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" {...drop.zoneProps}>
      <DropOverlay visible={drop.dragging} />

      <PinnedMessageBar
        pins={pins}
        nicknames={nicknames}
        onJump={(id) => void handleJumpToMessage(id)}
      />

      {/* Sem o scroll anchoring do navegador: a âncora do loadOlder é a única. */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto [overflow-anchor:none]"
        onScroll={handleScroll}
      >
        <RoomLoadingGate loading={loading}>
          <div ref={contentRef} className="flex min-h-full flex-col justify-end py-4">
            <OlderMessagesLoader ref={olderSentinelRef} visible={hasMore} loading={loadingOlder} />
            <EmptyRoomNotice empty={messages.length === 0} />
            {messages.map((m, i) => (
              <Fragment key={m.id}>
                <MessageDayDivider message={m} previous={messages[i - 1]} />
                <MessageItem
                  message={m}
                  grouped={isGroupedWithPrevious(m, messages[i - 1])}
                  serverId={serverId}
                  isHighlighted={highlightedId === m.id}
                  mentionLabels={labels}
                  onReply={() => handleStartReply(m)}
                  onReact={(emoji) => reactToMessage(m, emoji)}
                  onJumpToMessage={handleJumpToMessage}
                  onDelete={() => handleDelete(m.id)}
                  onVote={(answerIds) => votePollInRoom(room, m.id, answerIds)}
                  onEndPoll={() => endPollInRoom(room, m.id)}
                  onCopy={() => copyText(m.content)}
                  onStartEdit={() => startEdit(m.id)}
                  onSaveEdit={(text) => void saveEdit(m, text)}
                  onCancelEdit={closeEdit}
                  isEditing={editingId === m.id}
                  savingEdit={savingEdit && editingId === m.id}
                  canReact={permissions.canReact}
                  canModerate={permissions.canModerate}
                  canDelete={canDeleteMessages}
                  canPin={isChannel && permissions.canModerate}
                  onTogglePin={() => void handleTogglePin(m)}
                />
              </Fragment>
            ))}
            <MessageListTail room={room} serverId={serverId} bottomRef={bottomRef} />
          </div>
        </RoomLoadingGate>
      </div>

      <div className="relative shrink-0 px-4 max-md:px-2">
        <JumpToPresentButton
          visible={jump.visible}
          newCount={jump.newCount}
          onClick={() => jump.jumpToPresent(scrollRef.current)}
        />
        <ChatComposer
          room={room}
          serverId={serverId}
          placeholder={placeholder}
          mentionable={mentionable}
          canMentionEveryone={canMentionEveryone}
          disabledReason={disabledReason}
          permissions={permissions}
          isChannel={isChannel}
          inputRef={inputRef}
          roomRef={roomRef}
          followBottom={followBottom}
          replyingTo={replyingTo}
          replyAuthor={messageAuthorName(replyingTo, nicknames)}
          setReplyState={setReplyState}
          drafts={drafts}
          addFiles={addFiles}
          removeAttachment={removeAttachment}
          onPaste={drop.onPaste}
          onEditLast={editLast}
          onOpenPoll={openPoll}
        />
        <TypingIndicator room={room} serverId={serverId} />
      </div>
      <CreatePollModal
        open={pollOpen}
        onClose={() => setPollOpen(false)}
        onCreate={(input) => createPollInRoom(room, input)}
      />
    </div>
  )
}

export default ChatPane
