import { useRef, type Dispatch, type SetStateAction } from 'react'
import type { Message } from '../api/messages'
import { ACCEPT_ATTRIBUTE, type DraftAttachment } from '../lib/attachments'
import type { ChatPermissions } from '../lib/chatPermissions'
import { composerPlaceholder } from '../lib/chatPaneView'
import { composerKeyAction, type ComposerKeyAction } from '../lib/composerKeys'
import type { UserSuggestionInput } from '../lib/mentions'
import type { ReplyState } from '../lib/sendFailure'
import { useComposerSend } from '../hooks/useComposerSend'
import { useFilePickerShortcut } from '../hooks/useFilePickerShortcut'
import { useMentionMenu, type MentionMenu } from '../hooks/useMentionMenu'
import { useRoomDraft } from '../hooks/useRoomDraft'
import { useRoomState } from '../hooks/useRoomState'
import { useSendMedia } from '../hooks/useSendMedia'
import { useTypingSender } from '../hooks/useTypingSender'
import ComposerAttachments from './ComposerAttachments'
import MentionSuggestionList from './MentionSuggestionList'
import {
  AttachButton,
  ComposerGate,
  MediaPicker,
  MediaPickerButton,
  PollButton,
  ReplyBar,
  SlashCommandSuggestions,
  SubmitButton,
  VoiceButton
} from './ComposerParts'

export interface ChatComposerProps {
  room: string
  serverId?: string
  placeholder: string
  mentionable: UserSuggestionInput[]
  canMentionEveryone: boolean
  /** Troca o campo por este aviso (ex.: DM bloqueada, sem SEND_MESSAGES). */
  disabledReason?: string
  permissions: ChatPermissions
  isChannel: boolean
  inputRef: React.RefObject<HTMLInputElement | null>
  roomRef: { current: string }
  /** A lista volta a acompanhar o fim (envio de mensagem, figurinha, GIF). */
  followBottom: () => void
  replyingTo: Message | null
  replyAuthor: string
  setReplyState: Dispatch<SetStateAction<ReplyState | null>>
  /** Anexos do rascunho (ficam no ChatPane: soltar arquivo na lista também anexa). */
  drafts: DraftAttachment[]
  addFiles: (files: File[]) => void
  removeAttachment: (localId: string) => void
  onPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void
  /** ↑ no campo vazio: abre a última mensagem minha na edição (false se não há). */
  onEditLast: () => boolean
  onOpenPoll: () => void
}

type KeyHandlers = Record<ComposerKeyAction, (e: React.KeyboardEvent<HTMLInputElement>) => void>

function keyHandlers(
  menu: MentionMenu,
  onEditLast: () => boolean,
  cancelReply: () => void
): KeyHandlers {
  return {
    'mention-step': (e) => {
      e.preventDefault()
      menu.step(e.key === 'ArrowDown' ? 1 : -1)
    },
    'mention-pick': (e) => {
      e.preventDefault()
      menu.pick(menu.suggestions[menu.highlight].username)
    },
    'mention-close': () => menu.close(),
    'edit-last': (e) => {
      if (onEditLast()) e.preventDefault()
    },
    'cancel-reply': cancelReply,
    none: () => {}
  }
}

/**
 * Campo de mensagem do chat: texto (rascunho por sala), menções, anexos,
 * mídia, enquete e áudio. Fica fora da lista: digitar só redesenha o campo.
 */
function ChatComposer(p: ChatComposerProps): React.JSX.Element {
  const { room, inputRef, permissions, replyingTo, setReplyState } = p
  const [draft, setDraft] = useRoomDraft(room)
  const typing = useTypingSender(room)
  const [mediaPickerOpen, setMediaPickerOpen] = useRoomState(room, false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  useFilePickerShortcut(fileInputRef, permissions.canAttach)
  const menu = useMentionMenu({
    room,
    draft,
    replaceDraft: (text) => {
      setDraft(text)
      typing.onDraftChange(text)
    },
    inputRef,
    mentionable: p.mentionable,
    canMentionEveryone: p.canMentionEveryone
  })
  const send = useComposerSend({
    ...p,
    draft,
    setDraft,
    onSent: () => {
      typing.onSent()
      menu.reset()
    }
  })
  const { handleSendSticker, handleSendGif } = useSendMedia({
    room,
    draft,
    setDraft,
    replyingTo,
    setReplyState,
    followBottom: p.followBottom
  })
  const keys = keyHandlers(menu, p.onEditLast, () => setReplyState(null))
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void =>
    keys[
      composerKeyAction(e, {
        suggesting: menu.suggestions.length > 0,
        highlighted: menu.highlight >= 0,
        draftEmpty: draft === '',
        replying: replyingTo !== null
      })
    ](e)

  return (
    <>
      <MentionSuggestionList
        suggestions={menu.suggestions}
        highlight={menu.highlight}
        onPick={menu.pick}
        onHighlight={menu.setHighlight}
      />
      <ComposerAttachments drafts={p.drafts} onRemove={p.removeAttachment} />
      <ReplyBar
        replyingTo={replyingTo}
        authorName={p.replyAuthor}
        onCancel={() => setReplyState(null)}
      />
      <ComposerGate disabledReason={p.disabledReason}>
        <div className="relative">
          <MediaPicker
            open={mediaPickerOpen}
            serverId={p.serverId}
            onSelectEmoji={(emoji) => {
              setDraft((d) => d + emoji)
              inputRef.current?.focus()
            }}
            onSelectGif={handleSendGif}
            onSelectSticker={handleSendSticker}
            onClose={() => setMediaPickerOpen(false)}
          />
          <form
            onSubmit={send.handleSubmit}
            className="relative flex items-center gap-2 rounded-xl border border-subtle bg-input px-3 py-2 backdrop-blur-xl focus-within:border-violet-500/40 max-md:gap-0.5 max-md:px-1 max-md:py-1"
          >
            <SlashCommandSuggestions
              isChannel={p.isChannel}
              canSendTTS={permissions.canSendTTS}
              mentionOpen={menu.open}
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
                p.addFiles(Array.from(e.target.files ?? []))
                e.target.value = ''
              }}
            />
            <PollButton onClick={p.onOpenPoll} />
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                typing.onDraftChange(e.target.value)
                menu.onInput(e.target.value, e.target.selectionStart ?? 0)
              }}
              onKeyDown={handleKeyDown}
              onPaste={p.onPaste}
              onBlur={menu.close}
              placeholder={composerPlaceholder(replyingTo !== null, p.replyAuthor, p.placeholder)}
              maxLength={2000}
              className="min-w-0 flex-1 bg-transparent text-ds-chat text-strong placeholder:text-gray-500 outline-none"
            />
            <MediaPickerButton onClick={() => setMediaPickerOpen((v) => !v)} />
            <VoiceButton
              show={permissions.canAttach}
              room={room}
              disabled={send.sendingVoice}
              onRecorded={send.handleRecorded}
            />
            <SubmitButton
              sending={send.sending}
              submittable={send.submittable}
              uploading={send.uploading}
            />
          </form>
        </div>
      </ComposerGate>
    </>
  )
}

export default ChatComposer
