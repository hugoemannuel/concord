import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useUIStore } from '../../../shared/store/uiStore'
import { useAuthStore } from '../../auth/store/authStore'
import { useChatStore } from '../store/chatStore'
import type { Message } from '../api/messages'
import { showToast } from '../../../shared/store/toastStore'
import { useMusicStore } from '../../music/store/musicStore'
import { useServerNicknames } from '../../servers/hooks/useServerNames'
import { applyMention, mentionLabels, mentionQuery } from '../lib/mentions'
import { lastEditableMessage } from '../lib/messageEdit'
import { isGroupedWithPrevious } from '../lib/messageGrouping'
import MessageItem from './MessageItem'
import MessageDayDivider from './MessageDayDivider'
import { copyText } from '../../../shared/lib/clipboard'
import CreatePollModal from './CreatePollModal'
import { usePinStore } from '../store/pinStore'
import {
  ACCEPT_ATTRIBUTE,
  canSubmit,
  draftStatus,
  sendErrorMessage,
  uploadErrorMessage
} from '../lib/attachments'
import { uploadAttachment } from '../api/attachments'
import { ApiError } from '../../../shared/api/client'
import ComposerAttachments from './ComposerAttachments'
import { useAttachmentDraft } from '../hooks/useAttachmentDraft'
import { useRoomDraft } from '../hooks/useRoomDraft'
import { useSendMedia } from '../hooks/useSendMedia'
import { useRoomState } from '../hooks/useRoomState'
import { useMessageEditing } from '../hooks/useMessageEditing'
import { useTypingSender } from '../hooks/useTypingSender'
import { useFileDropZone } from '../hooks/useFileDropZone'
import TypingIndicator from './TypingIndicator'
import { reportSendFailure, type ReplyState } from '../lib/sendFailure'
import {
  ATTACH_DENIED,
  DIRECT_CHAT_PERMISSIONS,
  type ChatPermissions
} from '../lib/chatPermissions'
import { actionErrorMessage } from '../../servers/lib/permissionErrors'
import { permissionError } from '../../servers/lib/permissions'
import { JUMP_HIGHLIGHT_MS } from '../lib/scrollAnchor'
import { useStickToBottom } from '../hooks/useStickToBottom'
import { useJumpToPresent } from '../hooks/useJumpToPresent'
import JumpToPresentButton from './JumpToPresentButton'
import { useOlderMessages } from '../hooks/useOlderMessages'
import { useInfiniteScrollOlder } from '../hooks/useInfiniteScrollOlder'
import { useAutoFocusComposer } from '../hooks/useAutoFocusComposer'
import OlderMessagesLoader from './OlderMessagesLoader'
import PinnedMessageBar from './PinnedMessageBar'
import MentionSuggestionList from './MentionSuggestionList'
import {
  DropOverlay,
  EmptyRoomNotice,
  MessageListTail,
  RoomLoadingGate
} from './MessageListStates'
import {
  AttachButton,
  SlashCommandSuggestions,
  ComposerGate,
  MediaPicker,
  MediaPickerButton,
  PollButton,
  ReplyBar,
  SubmitButton,
  VoiceButton
} from './ComposerParts'
import { useRoomMessages } from '../hooks/useRoomMessages'
import { useChannelPins } from '../hooks/useChannelPins'
import { useJumpRequests } from '../hooks/useJumpRequests'
import { useReactToMessage } from '../hooks/useReactToMessage'
import {
  composerDisabledReason,
  composerPlaceholder,
  inRoom,
  mentionMenu,
  messageAuthorName
} from '../lib/chatPaneView'

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

const MAX_SUGGESTIONS = 6

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
  const sendToRoom = useChatStore((s) => s.sendToRoom)
  const deleteFromRoom = useChatStore((s) => s.deleteFromRoom)
  const reactToMessage = useReactToMessage(room)
  const createPollInRoom = useChatStore((s) => s.createPollInRoom)
  const votePollInRoom = useChatStore((s) => s.votePollInRoom)
  const endPollInRoom = useChatStore((s) => s.endPollInRoom)
  const [pollOpen, setPollOpen] = useRoomState(room, false)
  const [mediaPickerOpen, setMediaPickerOpen] = useRoomState(room, false)
  const meId = useAuthStore((s) => s.user?.id)

  const [draft, setDraft] = useRoomDraft(room)
  const [sending, setSending] = useRoomState(room, false)
  const [replyState, setReplyState] = useState<ReplyState | null>(null)
  const replyingTo = inRoom(replyState, room, 'message')
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const highlightTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(highlightTimer.current), [])
  const inputRef = useRef<HTMLInputElement>(null)
  useAutoFocusComposer({ room, inputRef, canSend: !disabledReason })
  const fileInputRef = useRef<HTMLInputElement>(null)
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
  // Ctrl+Shift+U (atalho global) abre o seletor de arquivos deste chat.
  const filePickerRequest = useUIStore((s) => s.filePickerRequest)
  const seenFilePickerRequest = useRef(filePickerRequest)
  useEffect(() => {
    if (filePickerRequest === seenFilePickerRequest.current) return
    seenFilePickerRequest.current = filePickerRequest
    if (permissions.canAttach) fileInputRef.current?.click()
  }, [filePickerRequest, permissions.canAttach])
  const typing = useTypingSender(room)
  const attachmentState = draftStatus(drafts)
  const submittable = canSubmit(draft, drafts)
  const drop = useFileDropZone(addFiles)
  const [sendingVoice, setSendingVoice] = useState(false)
  // Sala atual, para um envio que termina depois da troca de sala não limpar
  // o campo da sala nova.
  const roomRef = useRef(room)
  useEffect(() => {
    roomRef.current = room
  }, [room])
  // Envio que falha depois de sair do chat não mexe no campo (só oferece copiar).
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  const { editingId, savingEdit, startEdit, closeEdit, saveEdit } = useMessageEditing({
    room,
    roomRef,
    inputRef
  })
  const nicknames = useServerNicknames(serverId)
  const [mention, setMention] = useRoomState<{ query: string; start: number } | null>(room, null)
  const [highlightChoice, setHighlight] = useRoomState<number | null>(room, null)
  const meUsername = useAuthStore((s) => s.user?.username)
  const meUser = useAuthStore((s) => s.user)
  // Chips de menção: quem está no chat, eu e os autores da lista (que podem
  // ter saído do servidor). Em servidor vale o apelido; em DM, o nome.
  const roomMessages = messages
  const labels = useMemo(
    () =>
      mentionLabels([
        ...mentionable,
        ...(meUser
          ? [
              {
                username: meUser.username,
                display_name: meUser.display_name,
                nickname: nicknames?.[meUser.id]
              }
            ]
          : []),
        ...(roomMessages ?? []).flatMap((m) =>
          m.author ? [{ ...m.author, nickname: nicknames?.[m.author_id] }] : []
        )
      ]),
    [mentionable, meUser, roomMessages, nicknames]
  )
  const { suggestions, highlight } = mentionMenu(
    mention,
    highlightChoice,
    mentionable,
    canMentionEveryone,
    meUsername,
    MAX_SUGGESTIONS
  )

  const pickMention = (username: string): void => {
    const el = inputRef.current
    if (!mention || !el) return
    const next = applyMention(draft, mention.start, el.selectionStart ?? draft.length, username)
    setDraft(next.text)
    typing.onDraftChange(next.text)
    setMention(null)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(next.caret, next.caret)
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (suggestions.length > 0) {
      // Com Alt/Ctrl as setas são atalhos de navegação (useGlobalShortcuts).
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        const step = e.key === 'ArrowDown' ? 1 : -1
        const from = highlight < 0 ? (step > 0 ? -1 : 0) : highlight
        setHighlight((from + step + suggestions.length) % suggestions.length)
        return
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && highlight >= 0) {
        e.preventDefault()
        pickMention(suggestions[highlight].username)
        return
      }
      if (e.key === 'Escape') {
        setMention(null)
        return
      }
      // Sem item escolhido, Enter/Tab seguem normais (nada de @all sem querer).
      if (e.key === 'Enter' || e.key === 'Tab') return
    }
    // ↑ no campo vazio edita a sua última mensagem (como no Discord).
    if (
      e.key === 'ArrowUp' &&
      draft === '' &&
      !e.shiftKey &&
      !e.altKey &&
      !e.ctrlKey &&
      !e.metaKey
    ) {
      const last = lastEditableMessage(messages, meId)
      if (last) {
        e.preventDefault()
        startEdit(last.id)
        return
      }
    }
    if (e.key === 'Escape' && replyingTo) {
      setReplyState(null)
    }
  }

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

  const handleScroll = (e: React.UIEvent<HTMLDivElement>): void => {
    onScroll(e.currentTarget)
    jump.onScroll(e.currentTarget)
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!submittable || sending) return
    setSending(true)
    // A própria mensagem (e o "enviando…") aparece embaixo: acompanha.
    stickToBottom.current = true
    const sentRoom = room
    const sentText = draft
    const sentReply = replyingTo
    // Só sai do rascunho o que foi enviado: arquivo adicionado durante o envio fica.
    const sentDrafts = drafts.filter((d) => d.status === 'done').map((d) => d.localId)
    // O texto sai do campo na hora: dá para começar a próxima mensagem sem
    // esperar o servidor. Os anexos só saem quando o envio dá certo.
    typing.onSent()
    setDraft('')
    setReplyState(null)
    setMention(null)
    setHighlight(null)
    try {
      await sendToRoom(room, sentText.trim(), attachmentState.readyIds, sentReply?.id ?? null)
      if (roomRef.current === sentRoom) {
        sentDrafts.forEach(removeAttachment)
      }
    } catch (err) {
      const message =
        err instanceof ApiError
          ? permissionError(err.code, '') || sendErrorMessage(err.status, err.message)
          : 'Falha ao enviar mensagem.'
      handleSendFailure(message, sentRoom, sentText, sentReply)
    } finally {
      setSending(false)
    }
  }

  // O texto que falhou nunca se perde (ver lib/sendFailure).
  const handleSendFailure = (
    message: string,
    sentRoom: string,
    sentText: string,
    sentReply: Message | null
  ): void =>
    reportSendFailure(
      message,
      { room: sentRoom, text: sentText, reply: sentReply },
      {
        mounted: () => mountedRef.current,
        currentRoom: () => roomRef.current,
        currentText: () => inputRef.current?.value ?? '',
        setDraft,
        setReply: setReplyState,
        focusInput: () => requestAnimationFrame(() => inputRef.current?.focus()),
        error: showToast.error,
        copy: (text) => void navigator.clipboard?.writeText(text)
      }
    )

  // Áudio gravado vai sozinho; o texto digitado continua no campo.
  const handleRecorded = async (blob: Blob, durationMs: number): Promise<void> => {
    setSendingVoice(true)
    try {
      const attachment = await uploadAttachment(room, blob, {
        filename: 'gravacao.webm',
        duration_ms: durationMs
      })
      await sendToRoom(room, '', [attachment.id])
    } catch (err) {
      showToast.error(uploadErrorMessage(err instanceof ApiError ? err.status : 0))
    } finally {
      setSendingVoice(false)
    }
  }

  const handleSelectEmoji = (emoji: string): void => {
    setDraft((d) => d + emoji)
    inputRef.current?.focus()
  }

  const { handleSendSticker, handleSendGif } = useSendMedia({
    room,
    draft,
    setDraft,
    replyingTo,
    setReplyState,
    stickToBottom
  })

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

  const replyTargetAuthor = messageAuthorName(replyingTo, nicknames)

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
        <MentionSuggestionList
          suggestions={suggestions}
          highlight={highlight}
          onPick={pickMention}
          onHighlight={setHighlight}
        />
        <ComposerAttachments drafts={drafts} onRemove={removeAttachment} />
        <ReplyBar
          replyingTo={replyingTo}
          authorName={replyTargetAuthor}
          onCancel={() => setReplyState(null)}
        />
        <ComposerGate disabledReason={disabledReason}>
          <div className="relative">
            <MediaPicker
              open={mediaPickerOpen}
              serverId={serverId}
              onSelectEmoji={handleSelectEmoji}
              onSelectGif={handleSendGif}
              onSelectSticker={handleSendSticker}
              onClose={() => setMediaPickerOpen(false)}
            />
            <form
            onSubmit={handleSubmit}
            className="relative flex items-center gap-2 rounded-xl border border-subtle bg-input px-3 py-2 backdrop-blur-xl focus-within:border-violet-500/40 max-md:gap-0.5 max-md:px-1 max-md:py-1"
          >
            <SlashCommandSuggestions
              isChannel={isChannel}
              canSendTTS={permissions.canSendTTS}
              mentionOpen={mention !== null}
              input={draft}
              onPick={(text) => {
                setDraft(text)
                inputRef.current?.focus()
              }}
            />
            <AttachButton
              show={permissions.canAttach}
              onClick={() => fileInputRef.current?.click()}
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPT_ATTRIBUTE}
              hidden
              onChange={(e) => {
                addFiles(Array.from(e.target.files ?? []))
                e.target.value = ''
              }}
            />
            <PollButton onClick={() => setPollOpen(true)} />
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                typing.onDraftChange(e.target.value)
                setMention(mentionQuery(e.target.value, e.target.selectionStart ?? 0))
                setHighlight(null)
              }}
              onKeyDown={handleKeyDown}
              onPaste={drop.onPaste}
              onBlur={() => setMention(null)}
              placeholder={composerPlaceholder(replyingTo !== null, replyTargetAuthor, placeholder)}
              maxLength={2000}
              className="min-w-0 flex-1 bg-transparent text-ds-chat text-strong placeholder:text-gray-500 outline-none"
            />
            <MediaPickerButton onClick={() => setMediaPickerOpen((v) => !v)} />
            <VoiceButton
              show={permissions.canAttach}
              room={room}
              disabled={sendingVoice}
              onRecorded={handleRecorded}
            />
            <SubmitButton
              sending={sending}
              submittable={submittable}
              uploading={attachmentState.uploading}
            />
          </form>
          </div>
        </ComposerGate>
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
