import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useUIStore } from '../store/uiStore'
import { useAuthStore } from '../store/authStore'
import { useChatStore } from '../store/chatStore'
import type { Message } from '../api/messages'
import { showToast } from '../store/toastStore'
import SystemMessage from './SystemMessage'
import MusicMessage from './music/MusicMessage'
import MusicEphemeralList from './music/MusicEphemeralList'
import SlashSuggestions from './music/SlashSuggestions'
import { useMusicStore } from '../store/musicStore'
import Avatar from './Avatar'
import StyledName from './StyledName'
import { useUserLook } from '../store/profileStore'
import { profileCardHandler } from '../store/profileCardStore'
import { userMenuHandler } from '../store/userMenuStore'
import {
  useServerMemberColor,
  useServerNickname,
  useServerNicknames
} from '../store/useServerNames'
import { serverDisplayName } from '../lib/serverNames'
import { useFriendStore } from '../store/friendStore'
import { applyMention, mentionQuery, mentionSuggestions, messageMentionsMe } from '../lib/mentions'
import {
  canEditMessage,
  editErrorMessage,
  editOutcome,
  lastEditableMessage
} from '../lib/messageEdit'
import MessageText from './chat/MessageText'
import MessageEditor from './chat/MessageEditor'
import EmotePickerPopover from './chat/EmotePickerPopover'
import MessageActionsBar from './chat/MessageActionsBar'
import ReactionChips from './chat/ReactionChips'
import ReplyReference from './chat/ReplyReference'
import { copyText } from '../lib/clipboard'
import { messagePreview } from '../lib/polls'
import PollCard from './poll/PollCard'
import CreatePollModal from './poll/CreatePollModal'
import MessageAttachments from './chat/MessageAttachments'
import { PaperclipIcon, PollIcon, PinIcon } from './icons'
import { selectPins, usePinStore } from '../store/pinStore'
import {
  ACCEPT_ATTRIBUTE,
  canSubmit,
  draftStatus,
  sendErrorMessage,
  uploadErrorMessage
} from '../lib/attachments'
import { uploadAttachment } from '../api/attachments'
import { ApiError } from '../api/client'
import VoiceRecordButton from './chat/VoiceRecordButton'
import ComposerAttachments from './chat/ComposerAttachments'
import { useAttachmentDraft } from './chat/useAttachmentDraft'
import { useTypingSender } from './chat/useTypingSender'
import TypingIndicator from './chat/TypingIndicator'
import {
  afterSendFailure,
  canRestoreHere,
  replyAfterRestore,
  restoreFailedText
} from '../lib/composerDraft'
import {
  ATTACH_DENIED,
  DIRECT_CHAT_PERMISSIONS,
  sendDeniedReason,
  type ChatPermissions
} from '../lib/chatPermissions'
import { actionErrorMessage } from '../lib/permissionErrors'
import { permissionError } from '../lib/permissions'
import {
  anchoredScrollTop,
  measureOffset,
  olderPagePrepended,
  pickAnchor,
  type AnchorCandidate
} from '../lib/scrollAnchor'

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
  /** Se falso (ex.: canais de sistema #avisos e #bot), esconde a ação de excluir mensagens. */
  canDeleteMessages?: boolean
}

const MAX_SUGGESTIONS = 6
/** Reservas da âncora do loadOlder (a primeira e as seguintes). */
const ANCHOR_CANDIDATES = 20

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/** Tem texto selecionado que pega (ao menos em parte) este elemento? */
function selectionTouches(el: Element): boolean {
  const selection = window.getSelection()
  return Boolean(selection && !selection.isCollapsed && selection.containsNode(el, true))
}

function formatEditedAt(iso: string): string {
  const when = new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
  return `Editada em ${when}`
}

function MessageItem({
  message,
  serverId,
  isHighlighted,
  onReply,
  onReact,
  onJumpToMessage,
  onDelete,
  onVote,
  onEndPoll,
  onCopy,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  isEditing,
  savingEdit,
  canReact,
  canModerate,
  canDelete = true,
  canPin,
  onTogglePin
}: {
  canPin?: boolean
  onTogglePin?: () => void
  message: Message
  /** Canal de servidor: autor e resposta com o apelido daquele servidor. */
  serverId?: string
  isHighlighted: boolean
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
  /** Em canais de sistema (#avisos e #bot) nenhuma mensagem pode ser excluída. */
  canDelete?: boolean
}): React.JSX.Element {
  const me = useAuthStore((s) => s.user)
  const isMine = message.author_id === me?.id
  const author = message.author
  const look = useUserLook(message.author_id, {
    name:
      author?.display_name ??
      author?.username ??
      (isMine ? me?.display_name : null) ??
      'Desconhecido',
    avatarUrl: author?.avatar_url
  })
  const nickname = useServerNickname(serverId, message.author_id)
  const name = serverDisplayName({ nickname }, { display_name: look.name })
  const nameColor = useServerMemberColor(serverId, message.author_id)
  const replyNickname = useServerNickname(serverId, message.reply_to?.author_id)
  const replyAuthorColor = useServerMemberColor(serverId, message.reply_to?.author_id)
  const openProfile = profileCardHandler(message.author_id, name, author?.username, 'right')
  const [hover, setHover] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const authorBlocked = useFriendStore(
    (s) => !isMine && s.blocked.some((u) => u.id === message.author_id)
  )
  const [revealBlocked, setRevealBlocked] = useState(false)
  const onAuthorMenu = userMenuHandler(message.author_id, name, me?.id, author?.username)

  const mentionsMe = messageMentionsMe(message, me)
  const editable = canEditMessage(message, me?.id)
  const reactions = message.reactions ?? []
  const hasReplyReference = Boolean(message.reply_to_id || message.reply_to)
  const replyAuthorName = serverDisplayName({ nickname: replyNickname }, message.reply_to?.author)

  if (message.system_kind === 'music') return <MusicMessage message={message} />
  if (message.system_kind) return <SystemMessage message={message} />

  // Mensagem de quem você bloqueou: escondida, como no Discord.
  if (authorBlocked && !revealBlocked) {
    return (
      <div id={`msg-${message.id}`} className="px-4 py-1 text-ds-sm text-gray-500">
        1 mensagem bloqueada —{' '}
        <button
          type="button"
          onClick={() => setRevealBlocked(true)}
          className="cursor-pointer text-[#00a8fc] hover:underline"
        >
          Mostrar
        </button>
      </div>
    )
  }

  return (
    <div
      id={`msg-${message.id}`}
      className={`group relative flex flex-col gap-1 rounded-md px-4 py-1.5 transition-colors ${
        isHighlighted
          ? 'bg-[#5865f2]/20 ring-1 ring-[#5865f2]/50'
          : mentionsMe
            ? 'border-l-2 border-[#f0b232] bg-[#f0b232]/10 hover:bg-[#f0b232]/15'
            : 'hover:bg-white/[0.03]'
      }`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onContextMenu={(e) => {
        // Sobre texto selecionado desta linha ou link fica o menu do
        // navegador/app (copiar, copiar link); no resto da linha, o do autor.
        if (selectionTouches(e.currentTarget) || (e.target as Element).closest('a')) return
        onAuthorMenu?.(e)
      }}
    >
      {hasReplyReference && (
        <ReplyReference
          authorName={message.reply_to ? replyAuthorName : null}
          authorColor={replyAuthorColor}
          content={message.reply_to?.content ?? ''}
          onJump={() => message.reply_to && onJumpToMessage(message.reply_to.id)}
        />
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={openProfile}
          aria-label={`Perfil de ${name}`}
          className="h-10 shrink-0 cursor-pointer self-start rounded-full"
        >
          <Avatar userId={message.author_id} name={name} avatarUrl={look.avatarUrl} size={40} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <button
              type="button"
              onClick={openProfile}
              style={nameColor ? { color: nameColor } : undefined}
              className={`cursor-pointer text-ds-chat font-medium hover:underline ${
                nameColor ? '' : 'text-white'
              }`}
            >
              {nickname ? (
                name
              ) : (
                <StyledName name={name} userId={message.author_id} style={author?.name_style} />
              )}
            </button>
            <span className="text-ds-xs font-medium text-gray-500">
              {formatTime(message.created_at)}
            </span>
            {message.edited_at && (
              <span className="text-ds-xs text-gray-500" title={formatEditedAt(message.edited_at)}>
                (editada)
              </span>
            )}
            {message.pinned_at && (
              <span className="flex items-center gap-0.5 text-ds-xs text-amber-400 font-medium" title="Mensagem fixada">
                <PinIcon className="h-3 w-3" />
                <span>fixada</span>
              </span>
            )}
          </div>
          {isEditing ? (
            <MessageEditor
              initial={message.content}
              saving={savingEdit}
              onSave={onSaveEdit}
              onCancel={onCancelEdit}
            />
          ) : (
            message.content && (
              <MessageText content={message.content} everyone={message.mention_everyone ?? null} />
            )
          )}
          {message.attachments?.length ? (
            <MessageAttachments attachments={message.attachments} />
          ) : null}
          {message.poll && (
            <PollCard
              poll={message.poll}
              isAuthor={isMine || canModerate}
              onVote={onVote}
              onEnd={onEndPoll}
            />
          )}

          <ReactionChips
            reactions={reactions}
            meId={me?.id}
            canReact={canReact}
            serverId={serverId}
            onReact={onReact}
            onOpenPicker={() => setPickerOpen((v) => !v)}
          />
        </div>

        {(hover || pickerOpen) && (
          <MessageActionsBar
            canReact={canReact}
            onReact={onReact}
            onTogglePicker={() => setPickerOpen((v) => !v)}
            onReply={onReply}
            onCopy={message.content ? onCopy : undefined}
            onEdit={editable && !isEditing ? onStartEdit : undefined}
            canPin={canPin}
            isPinned={Boolean(message.pinned_at)}
            onTogglePin={onTogglePin}
            onDelete={canDelete && (isMine || canModerate) ? onDelete : undefined}
            deleteTitle={isMine ? 'Excluir mensagem' : 'Excluir mensagem (moderação)'}
          />
        )}
      </div>

      {pickerOpen && canReact && (
        <EmotePickerPopover
          onSelect={(emoji) => onReact(emoji)}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

function ChatPane({
  room,
  serverId,
  placeholder = 'Digite sua mensagem',
  mentionable = [],
  canMentionEveryone = false,
  disabledReason: disabledReasonProp,
  permissions = DIRECT_CHAT_PERMISSIONS,
  canDeleteMessages = true
}: ChatPaneProps): React.JSX.Element {
  // Sem SEND_MESSAGES o campo de mensagem dá lugar ao aviso.
  const disabledReason = disabledReasonProp ?? sendDeniedReason(permissions)
  const messagesByRoom = useChatStore((s) => s.messagesByRoom)
  const hasMoreByRoom = useChatStore((s) => s.hasMoreByRoom)
  const loadingByRoom = useChatStore((s) => s.loadingByRoom)
  const messages = messagesByRoom[room] ?? []
  const hasMore = hasMoreByRoom[room] ?? false
  const loading = loadingByRoom[room] ?? true
  const openRoom = useChatStore((s) => s.openRoom)
  const loadOlder = useChatStore((s) => s.loadOlder)
  const sendToRoom = useChatStore((s) => s.sendToRoom)
  const deleteFromRoom = useChatStore((s) => s.deleteFromRoom)
  const toggleReaction = useChatStore((s) => s.toggleReaction)
  const createPollInRoom = useChatStore((s) => s.createPollInRoom)
  const votePollInRoom = useChatStore((s) => s.votePollInRoom)
  const endPollInRoom = useChatStore((s) => s.endPollInRoom)
  const editInRoom = useChatStore((s) => s.editInRoom)
  const [pollOpen, setPollOpen] = useState(false)
  // Mensagem aberta na edição, por sala (o ServerView reaproveita o ChatPane).
  const [editState, setEditState] = useState<{ room: string; id: string } | null>(null)
  const editingId = editState?.room === room ? editState.id : null
  const [savingEdit, setSavingEdit] = useState(false)
  const meId = useAuthStore((s) => s.user?.id)

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [replyState, setReplyState] = useState<{ room: string; message: Message } | null>(null)
  const replyingTo = replyState?.room === room ? replyState.message : null
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
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
  // dragenter/dragleave disparam a cada filho; o contador evita piscar.
  const dragDepth = useRef(0)
  const [dragging, setDragging] = useState(false)
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
  const nicknames = useServerNicknames(serverId)
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null)
  const [highlightChoice, setHighlight] = useState<number | null>(null)
  const meUsername = useAuthStore((s) => s.user?.username)
  // Tab/Enter pegam o item padrão (sempre uma pessoa, se houver) até a
  // pessoa navegar com as setas.
  const { items: suggestions, defaultIndex } = mention
    ? mentionSuggestions(mention.query, mentionable, canMentionEveryone, {
        exclude: meUsername,
        max: MAX_SUGGESTIONS
      })
    : { items: [], defaultIndex: -1 }
  const highlight = highlightChoice ?? defaultIndex

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

  const startEdit = (messageId: string): void => {
    setEditState({ room, id: messageId })
    requestAnimationFrame(() =>
      document.getElementById(`msg-${messageId}`)?.scrollIntoView({ block: 'nearest' })
    )
  }

  const closeEdit = (): void => {
    setEditState(null)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const handleSaveEdit = async (message: Message, draft: string): Promise<void> => {
    const outcome = editOutcome(message.content, draft, Boolean(message.attachments?.length))
    if (outcome.kind === 'unchanged') {
      closeEdit()
      return
    }
    if (outcome.kind === 'empty') {
      showToast.error('A mensagem não pode ficar vazia.')
      return
    }
    const editedRoom = room
    setSavingEdit(true)
    try {
      await editInRoom(editedRoom, message.id, outcome.content)
      if (roomRef.current === editedRoom) closeEdit()
    } catch (err) {
      showToast.error(editErrorMessage(err) ?? actionErrorMessage(err, 'Falha ao editar mensagem.'))
    } finally {
      setSavingEdit(false)
    }
  }

  // Por sala: o ServerView reaproveita o ChatPane entre canais, e o
  // carregamento de um canal não pode travar (nem destravar) o botão do outro.
  const [loadingOlderRooms, setLoadingOlderRooms] = useState<ReadonlySet<string>>(new Set())
  const loadingOlder = loadingOlderRooms.has(room)
  const bottomRef = useRef<HTMLDivElement>(null)
  const ephemeralCount = useMusicStore((s) => s.ephemeral.length)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const firstRender = useRef(true)
  // loadOlder: a antiga primeira mensagem (e sua posição no conteúdo) fica
  // no mesmo lugar da tela quando a página antiga entra em cima dela. As
  // seguintes vão junto, de reserva, caso ela seja apagada durante a espera.
  const olderAnchor = useRef<{ room: string; candidates: AnchorCandidate[] } | null>(null)

  useEffect(() => {
    stickToBottom.current = true
    olderAnchor.current = null
    void openRoom(room)
    return () => {
      useChatStore.getState().closeRoom(room)
    }
  }, [room, openRoom])

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      bottomRef.current?.scrollIntoView()
      return
    }
    if (stickToBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length, ephemeralCount])

  const firstId = messages[0]?.id
  useLayoutEffect(() => {
    const el = scrollRef.current
    const anchor = olderAnchor.current
    // Só quando a página antiga entrou em cima; mensagem ao vivo embaixo (ou a
    // de cima apagada) não gasta a âncora.
    if (!el || !anchor || !olderPagePrepended(firstId, anchor.candidates)) return
    olderAnchor.current = null
    if (anchor.room !== room) return
    const elementOf = (id: string): HTMLElement | null => {
      const node = document.getElementById(`msg-${id}`)
      return node && el.contains(node) ? node : null
    }
    const kept = pickAnchor(anchor.candidates, (id) => elementOf(id) !== null)
    const node = kept && elementOf(kept.id)
    if (!kept || !node) return
    el.scrollTop = anchoredScrollTop(el.scrollTop, kept.offset, measureOffset(el, node))
  }, [firstId, room])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>): void => {
    const el = e.currentTarget
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
  }

  const handleLoadOlder = async (): Promise<void> => {
    if (loadingOlder) return
    const startedRoom = room
    setLoadingOlderRooms((current) => new Set(current).add(startedRoom))
    const el = scrollRef.current
    let anchor: typeof olderAnchor.current = null
    if (el) {
      const candidates: AnchorCandidate[] = []
      for (const m of messages.slice(0, ANCHOR_CANDIDATES)) {
        const node = document.getElementById(`msg-${m.id}`)
        if (node) candidates.push({ id: m.id, offset: measureOffset(el, node) })
      }
      if (candidates.length > 0) {
        anchor = { room: startedRoom, candidates }
        olderAnchor.current = anchor
        stickToBottom.current = false
      }
    }
    await loadOlder(startedRoom)
    setLoadingOlderRooms((current) => {
      const next = new Set(current)
      next.delete(startedRoom)
      return next
    })
    // Nada novo (ou já aplicado no layout effect): esta âncora não vale para
    // a próxima mudança. Só a desta chamada — outra sala pode ter a sua.
    requestAnimationFrame(() => {
      if (anchor && olderAnchor.current === anchor) olderAnchor.current = null
    })
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!submittable || sending) return
    setSending(true)
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

  // O texto que falhou nunca se perde: volta sozinho se o campo continua
  // vazio; senão o aviso oferece "Restaurar" (vem antes do texto novo, com a
  // resposta). Em outra sala o campo é de lá: o aviso oferece copiar.
  const handleSendFailure = (
    message: string,
    sentRoom: string,
    sentText: string,
    sentReply: Message | null
  ): void => {
    const sentReplyState = sentReply ? { room: sentRoom, message: sentReply } : null
    const here = (): boolean => canRestoreHere(mountedRef.current, roomRef.current, sentRoom)
    const copyAction = {
      label: 'Copiar',
      run: () => void navigator.clipboard?.writeText(sentText)
    }
    if (!here()) {
      showToast.error(message, 10000, sentText.trim() ? copyAction : undefined)
      return
    }
    const current = inputRef.current?.value ?? ''
    const action = afterSendFailure(sentText, sentReply !== null, current)
    if (action === 'restore') {
      setDraft(sentText)
      setReplyState((now) => replyAfterRestore(now, sentReplyState))
      showToast.error(message)
      return
    }
    if (action === 'nothing') {
      showToast.error(message)
      return
    }
    showToast.error(message, 10000, {
      label: 'Restaurar',
      run: () => {
        if (!here()) {
          if (sentText.trim()) {
            showToast.error(
              'Você saiu da conversa: copie a mensagem que falhou.',
              10000,
              copyAction
            )
          }
          return
        }
        setDraft((now) => restoreFailedText(sentText, now))
        setReplyState((now) => replyAfterRestore(now, sentReplyState))
        requestAnimationFrame(() => inputRef.current?.focus())
      }
    })
  }

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

  const hasFiles = (e: React.DragEvent): boolean => e.dataTransfer.types.includes('Files')

  const handleDragEnter = (e: React.DragEvent): void => {
    if (!hasFiles(e)) return
    e.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent): void => {
    if (!hasFiles(e)) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }

  const handleDrop = (e: React.DragEvent): void => {
    if (!hasFiles(e)) return
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    addFiles(Array.from(e.dataTransfer.files))
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>): void => {
    // Colar texto continua normal; só arquivo (ex.: print) vira anexo.
    if (e.clipboardData.files.length === 0) return
    e.preventDefault()
    addFiles(Array.from(e.clipboardData.files))
  }

  const handleReact = async (messageId: string, emoji: string): Promise<void> => {
    try {
      await toggleReaction(room, messageId, emoji)
    } catch (err) {
      showToast.error(actionErrorMessage(err, 'Falha ao reagir à mensagem.'))
    }
  }

  const handleStartReply = (message: Message): void => {
    setReplyState({ room, message })
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const handleJumpToMessage = (messageId: string): void => {
    const el = document.getElementById(`msg-${messageId}`)
    if (!el) {
      showToast.info('A mensagem original é mais antiga e não está carregada na tela.')
      return
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightedId(messageId)
    window.setTimeout(() => {
      setHighlightedId((current) => (current === messageId ? null : current))
    }, 1600)
  }

  useEffect(() => {
    const onJump = (e: Event) => {
      const detail = (e as CustomEvent<{ messageId: string }>).detail
      if (detail?.messageId) {
        handleJumpToMessage(detail.messageId)
      }
    }
    window.addEventListener('concord:jump-to-message', onJump)
    return () => window.removeEventListener('concord:jump-to-message', onJump)
  }, [room])

  const isChannel = room.startsWith('channel:')
  const channelId = isChannel ? room.slice('channel:'.length) : null

  const handleTogglePin = async (message: Message) => {
    if (!channelId) return
    if (message.pinned_at) {
      await usePinStore.getState().unpin(channelId, message.id)
    } else {
      await usePinStore.getState().pin(channelId, message.id)
    }
  }

  // selectPins: sem fixadas devolve sempre o mesmo array (senão: React #185).
  const pins = usePinStore(selectPins(channelId ?? ''))
  const loadPins = usePinStore((s) => s.loadPins)

  useEffect(() => {
    if (channelId) {
      void loadPins(channelId)
    }
  }, [channelId, loadPins])

  const latestPin = pins[0]
  const latestPinAuthorName = serverDisplayName(
    { nickname: latestPin ? nicknames?.[latestPin.author_id] : undefined },
    latestPin?.author
  )
  const latestPinPreview =
    latestPin?.content.trim() ||
    (latestPin?.attachments?.length
      ? latestPin.attachments[0].kind === 'image'
        ? '📷 Imagem'
        : latestPin.attachments[0].kind === 'video'
        ? '🎥 Vídeo'
        : latestPin.attachments[0].kind === 'audio'
        ? '🎵 Áudio'
        : '📎 Anexo'
      : latestPin?.poll
      ? '📊 Enquete: ' + latestPin.poll.question
      : 'Mensagem fixada')

  const replyTargetAuthor = serverDisplayName(
    { nickname: replyingTo ? nicknames?.[replyingTo.author_id] : undefined },
    replyingTo?.author
  )

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragEnter={handleDragEnter}
      onDragOver={(e) => {
        if (hasFiles(e)) e.preventDefault()
      }}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-violet-400/70 bg-black/60 text-sm font-semibold text-white">
          Solte os arquivos para enviar
        </div>
      )}

      {/* Barra com a última mensagem fixada no topo do canal */}
      {latestPin && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => handleJumpToMessage(latestPin.id)}
          onKeyDown={(e) => e.key === 'Enter' && handleJumpToMessage(latestPin.id)}
          title="Clique para ir até a mensagem fixada"
          className="group relative z-10 flex shrink-0 cursor-pointer items-center justify-between border-b border-white/6 bg-[#18191c]/80 px-4 py-2 backdrop-blur transition hover:bg-[#1f2024]"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-400/15 text-amber-400">
              <PinIcon className="h-3.5 w-3.5" />
            </span>
            <div className="flex min-w-0 items-center gap-1.5 text-ds-xs">
              <span className="shrink-0 font-semibold text-white">
                {latestPinAuthorName}:
              </span>
              <span className="truncate text-gray-300">
                {latestPinPreview}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 pl-3">
            {pins.length > 1 && (
              <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] font-medium text-gray-400">
                +{pins.length - 1} fixada{pins.length - 1 > 1 ? 's' : ''}
              </span>
            )}
            <span className="text-[11px] font-medium text-violet-400 opacity-80 group-hover:opacity-100 group-hover:underline">
              Ir para mensagem →
            </span>
          </div>
        </div>
      )}

      {/* Sem o scroll anchoring do navegador: a âncora do loadOlder é a única. */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto [overflow-anchor:none]"
        onScroll={handleScroll}
      >
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            Carregando mensagens...
          </div>
        ) : (
          <div className="flex min-h-full flex-col justify-end py-4">
            {hasMore && (
              <div className="flex justify-center py-2">
                <button
                  onClick={handleLoadOlder}
                  disabled={loadingOlder}
                  className="cursor-pointer rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
                >
                  {loadingOlder ? 'Carregando...' : 'Carregar mensagens anteriores'}
                </button>
              </div>
            )}
            {messages.length === 0 && (
              <div className="flex items-center justify-center py-8 text-center text-sm text-gray-500">
                Nenhuma mensagem por aqui ainda. Seja o primeiro a escrever!
              </div>
            )}
            {messages.map((m) => (
              <MessageItem
                key={m.id}
                message={m}
                serverId={serverId}
                isHighlighted={highlightedId === m.id}
                onReply={() => handleStartReply(m)}
                onReact={(emoji) => void handleReact(m.id, emoji)}
                onJumpToMessage={handleJumpToMessage}
                onDelete={() => handleDelete(m.id)}
                onVote={(answerIds) => votePollInRoom(room, m.id, answerIds)}
                onEndPoll={() => endPollInRoom(room, m.id)}
                onCopy={() => copyText(m.content)}
                onStartEdit={() => startEdit(m.id)}
                onSaveEdit={(text) => void handleSaveEdit(m, text)}
                onCancelEdit={closeEdit}
                isEditing={editingId === m.id}
                savingEdit={savingEdit && editingId === m.id}
                canReact={permissions.canReact}
                canModerate={permissions.canModerate}
                canDelete={canDeleteMessages}
                canPin={isChannel && permissions.canModerate}
                onTogglePin={() => void handleTogglePin(m)}
              />
            ))}
            <MusicEphemeralList room={room} serverId={serverId ?? null} />
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="relative shrink-0 px-4">
        {suggestions.length > 0 && (
          <ul
            role="listbox"
            aria-label="Marcar alguém"
            className="absolute bottom-full left-4 right-4 mb-2 overflow-hidden rounded-lg border border-white/10 bg-[#111214] py-1 shadow-2xl"
          >
            {suggestions.map((m, i) => (
              <li
                key={`${m.kind}:${m.username}`}
                role="option"
                aria-selected={i === highlight}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pickMention(m.username)
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm ${
                  i === highlight ? 'bg-[#5865f2]/30 text-white' : 'text-gray-300'
                }`}
              >
                {m.kind === 'everyone' ? (
                  <>
                    <span className="font-semibold">@{m.username}</span>
                    <span className="text-xs text-gray-400">{m.description}</span>
                  </>
                ) : (
                  <>
                    <span className="font-semibold">{serverDisplayName(m, m)}</span>
                    <span className="text-xs text-gray-400">@{m.username}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <ComposerAttachments drafts={drafts} onRemove={removeAttachment} />
        {replyingTo && (
          <div className="mb-1.5 flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#18191c] px-3 py-1.5 text-ds-sm text-gray-300">
            <div className="min-w-0 truncate">
              Respondendo a <span className="font-semibold text-white">@{replyTargetAuthor}</span>
              <span className="ml-2 text-gray-400">{messagePreview(replyingTo)}</span>
            </div>
            <button
              type="button"
              onClick={() => setReplyState(null)}
              title="Cancelar resposta (Esc)"
              className="shrink-0 cursor-pointer rounded px-1.5 py-0.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}
        {disabledReason ? (
          <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-center text-sm text-gray-400">
            {disabledReason}
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="relative flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 backdrop-blur-xl focus-within:border-violet-500/40"
          >
            {room.startsWith('channel:') && !mention && (
              <SlashSuggestions
                input={draft}
                onPick={(text) => {
                  setDraft(text)
                  inputRef.current?.focus()
                }}
              />
            )}
            {permissions.canAttach && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Anexar arquivo"
                aria-label="Anexar arquivo"
                className="shrink-0 cursor-pointer rounded-md p-1 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <PaperclipIcon className="h-5 w-5" />
              </button>
            )}
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
            <button
              type="button"
              onClick={() => setPollOpen(true)}
              title="Criar enquete"
              aria-label="Criar enquete"
              className="shrink-0 cursor-pointer rounded-md p-1 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <PollIcon className="h-5 w-5" />
            </button>
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
              onPaste={handlePaste}
              onBlur={() => setMention(null)}
              placeholder={replyingTo ? `Responder a @${replyTargetAuthor}...` : placeholder}
              maxLength={2000}
              className="min-w-0 flex-1 bg-transparent text-ds-chat text-white placeholder:text-gray-500 outline-none"
            />
            {permissions.canAttach && (
              <VoiceRecordButton key={room} disabled={sendingVoice} onRecorded={handleRecorded} />
            )}
            <button
              type="submit"
              disabled={sending || !submittable}
              className="cursor-pointer rounded-lg bg-[#5865f2] px-3 py-1.5 text-ds-sm font-medium text-white transition-all hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {attachmentState.uploading
                ? 'Enviando arquivos...'
                : sending
                  ? 'Enviando...'
                  : 'Enviar'}
            </button>
          </form>
        )}
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
