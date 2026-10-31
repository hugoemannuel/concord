import type { Message, ReplyPreview } from '../api/messages'
import type { MentionLabels } from '../lib/mentions'
import { stickerUnavailable } from '../lib/messageItem'
import Avatar from '../../../shared/ui/Avatar'
import StyledName from '../../profile/components/StyledName'
import { useServerMemberColor, useServerNickname } from '../../servers/hooks/useServerNames'
import { serverDisplayName } from '../../servers/lib/serverNames'
import { PinIcon } from '../../../shared/ui/icons'
import MessageText from './MessageText'
import MessageEditor from './MessageEditor'
import ReplyReference from './ReplyReference'
import PollCard from './PollCard'
import CallInviteCard from '../../call/components/CallInviteCard'
import MessageAttachments from './MessageAttachments'
import MessageSticker from './MessageSticker'
import MessageGif from './MessageGif'
import TTSBadge from '../../tts/components/TTSBadge'
import { useChatStore } from '../store/chatStore'
import { messagePreviewParts } from '../lib/polls'
import { textPreview, type Preview } from '../lib/preview'

// Pedaços da linha de mensagem do chat (ver MessageItem).

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
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

/** TTS, "(editada)" e "fixada" ao lado do nome (ou sozinhos, na linha agrupada). */
export function MessageBadges({ message }: { message: Message }): React.JSX.Element {
  return (
    <>
      <TTSBadge show={message.tts} />
      {message.edited_at && (
        <span className="text-ds-xs text-faint" title={formatEditedAt(message.edited_at)}>
          (editada)
        </span>
      )}
      {message.pinned_at && (
        <span
          className="flex items-center gap-0.5 text-ds-xs text-warning font-medium"
          title="Mensagem fixada"
        >
          <PinIcon className="h-3 w-3" />
          <span>fixada</span>
        </span>
      )}
    </>
  )
}

/** Mensagem de quem você bloqueou: escondida, como no Discord. */
export function BlockedMessageNotice({
  messageId,
  onReveal
}: {
  messageId: string
  onReveal: () => void
}): React.JSX.Element {
  return (
    <div id={`msg-${messageId}`} className="px-4 py-1 text-ds-sm text-faint">
      1 mensagem bloqueada —{' '}
      <button type="button" onClick={onReveal} className="cursor-pointer text-link hover:underline">
        Mostrar
      </button>
    </div>
  )
}

/** Prévia do que foi citado na resposta (anexo, enquete, figurinha, GIF ou texto comum). */
export function replyPreview(
  original: Message | undefined,
  replyTo: ReplyPreview | null | undefined
): Preview {
  if (original) return messagePreviewParts(original)
  return textPreview(replyTo?.content || '')
}

/** "Respondendo a…" acima da mensagem, com o avatar, o apelido, a cor e a prévia do que foi respondido. */
export function MessageReplyReference({
  message,
  serverId,
  onJumpToMessage
}: {
  message: Message
  serverId?: string
  onJumpToMessage: (messageId: string) => void
}): React.JSX.Element {
  const room = message.channel_id
    ? `channel:${message.channel_id}`
    : message.conversation_id
      ? `conversation:${message.conversation_id}`
      : null
  const originalMessage = useChatStore((s) => {
    if (!message.reply_to?.id || !room) return undefined
    return s.messagesByRoom[room]?.find((m) => m.id === message.reply_to?.id)
  })

  const replyAuthorId = originalMessage?.author_id ?? message.reply_to?.author_id
  const replyAuthor = originalMessage?.author ?? message.reply_to?.author
  const replyNickname = useServerNickname(serverId, replyAuthorId)
  const replyAuthorColor = useServerMemberColor(serverId, replyAuthorId)
  const replyAuthorName = serverDisplayName({ nickname: replyNickname }, replyAuthor)
  const preview = replyPreview(originalMessage, message.reply_to)

  return (
    <ReplyReference
      authorName={message.reply_to ? replyAuthorName : null}
      authorAvatarUrl={replyAuthor?.avatar_url}
      authorId={replyAuthorId}
      authorColor={replyAuthorColor}
      preview={preview}
      onJump={() => message.reply_to && onJumpToMessage(message.reply_to.id)}
    />
  )
}

/** Coluna da esquerda: o avatar, ou (agrupada) a hora que aparece ao passar o mouse. */
export function MessageGutter({
  compact,
  message,
  name,
  avatarUrl,
  onOpenProfile
}: {
  compact: boolean
  message: Message
  name: string
  avatarUrl?: string | null
  onOpenProfile: (e: React.MouseEvent<HTMLElement>) => void
}): React.JSX.Element {
  if (compact) {
    // Mesma largura do avatar; a hora aparece ao passar o mouse.
    return (
      <span
        aria-hidden="true"
        className="w-10 shrink-0 select-none self-start pt-[3px] text-center text-ds-xxs font-medium leading-[1.375rem] text-faint opacity-0 group-hover:opacity-100"
      >
        {formatTime(message.created_at)}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onOpenProfile}
      aria-label={`Perfil de ${name}`}
      className="h-10 shrink-0 cursor-pointer self-start rounded-full"
    >
      <Avatar
        userId={message.author_id}
        name={name}
        avatarUrl={avatarUrl}
        decorationUrl={message.author?.avatar_decoration_url}
        size={40}
      />
    </button>
  )
}

/** Nome (com apelido e cor do cargo), hora e selos; na linha agrupada só os selos. */
export function MessageHeader({
  compact,
  message,
  name,
  nickname,
  nameColor,
  onOpenProfile
}: {
  compact: boolean
  message: Message
  name: string
  nickname?: string | null
  nameColor?: string | null
  onOpenProfile: (e: React.MouseEvent<HTMLElement>) => void
}): React.JSX.Element | null {
  if (compact) {
    return message.tts || message.edited_at || message.pinned_at ? (
      <div className="flex items-baseline gap-2">
        <MessageBadges message={message} />
      </div>
    ) : null
  }
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      {/* Nome longo: corta com reticências (no celular ele quebrava centralizado). */}
      <button
        type="button"
        onClick={onOpenProfile}
        style={nameColor ? { color: nameColor } : undefined}
        className={`min-w-0 cursor-pointer truncate text-left text-ds-chat font-medium hover:underline ${
          nameColor ? '' : 'text-strong'
        }`}
      >
        {nickname ? (
          name
        ) : (
          <StyledName name={name} userId={message.author_id} style={message.author?.name_style} />
        )}
      </button>
      <span className="shrink-0 text-ds-xs font-medium text-faint">
        {formatTime(message.created_at)}
      </span>
      <MessageBadges message={message} />
    </div>
  )
}

/** Figurinha, ou o aviso de "Figurinha indisponível". */
function MessageStickerSlot({ message }: { message: Message }): React.JSX.Element | null {
  if (message.sticker) return <MessageSticker sticker={message.sticker} />
  if (!stickerUnavailable(message)) return null
  return (
    <div className="my-1 flex h-28 w-28 items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/5 p-2 text-center text-ds-xs text-faint">
      Figurinha indisponível
    </div>
  )
}

/** Texto (ou o editor), cartão de convite, figurinha, GIF, anexos e enquete. */
export function MessageContent({
  message,
  mentionLabels,
  isEditing,
  savingEdit,
  onSaveEdit,
  onCancelEdit,
  canEndPoll,
  onVote,
  onEndPoll
}: {
  message: Message
  mentionLabels?: MentionLabels
  isEditing: boolean
  savingEdit: boolean
  onSaveEdit: (draft: string) => void
  onCancelEdit: () => void
  /** Autor ou moderação: encerra a enquete. */
  canEndPoll: boolean
  onVote: (answerIds: number[]) => Promise<void>
  onEndPoll: () => Promise<void>
}): React.JSX.Element {
  return (
    <>
      {isEditing ? (
        <MessageEditor
          initial={message.content}
          saving={savingEdit}
          onSave={onSaveEdit}
          onCancel={onCancelEdit}
        />
      ) : (
        message.content &&
        !message.call_invite && (
          <MessageText
            content={message.content}
            everyone={message.mention_everyone ?? null}
            mentionLabels={mentionLabels}
          />
        )
      )}
      {message.call_invite && <CallInviteCard message={message} />}
      <MessageStickerSlot message={message} />
      {message.gif_url && <MessageGif gifUrl={message.gif_url} metadata={message.gif_metadata} />}
      {message.attachments?.length ? (
        <MessageAttachments attachments={message.attachments} copyImages />
      ) : null}
      {message.poll && (
        <PollCard poll={message.poll} isAuthor={canEndPoll} onVote={onVote} onEnd={onEndPoll} />
      )}
    </>
  )
}
