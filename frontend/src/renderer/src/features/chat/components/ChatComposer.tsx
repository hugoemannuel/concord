import { useRef, type Dispatch, type SetStateAction } from 'react'
import type { Message } from '../api/messages'
import type { DraftAttachment } from '../lib/attachments'
import type { ChatPermissions } from '../lib/chatPermissions'
import { composerPlaceholder } from '../lib/chatPaneView'
import type { UserSuggestionInput } from '../lib/mentions'
import type { ReplyState } from '../lib/sendFailure'
import { useComposerSend } from '../hooks/useComposerSend'
import { useFilePickerShortcut } from '../hooks/useFilePickerShortcut'
import { useMentionMenu } from '../hooks/useMentionMenu'
import { useRoomDraft } from '../hooks/useRoomDraft'
import { useRoomState } from '../hooks/useRoomState'
import { useSendMedia } from '../hooks/useSendMedia'
import { useSlowmode } from '../hooks/useSlowmode'
import { useTypingSender } from '../hooks/useTypingSender'
import ComposerAttachments from './ComposerAttachments'
import ComposerInput from './composer/ComposerInput'
import SlowmodeBar from './composer/SlowmodeBar'
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
  inputRef: React.RefObject<HTMLTextAreaElement | null>
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
  onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void
  /** ↑ no campo vazio: abre a última mensagem minha na edição (false se não há). */
  onEditLast: () => boolean
  onOpenPoll: () => void
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
  const slowmode = useSlowmode(room, permissions.bypassSlowmode)
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
    slowmode,
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
    followBottom: p.followBottom,
    slowmode
  })

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
        <SlowmodeBar text={slowmode.text} />
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
            className="relative flex items-end gap-2 rounded-xl border border-subtle bg-input px-3 py-2 backdrop-blur-xl focus-within:border-violet-500/40 max-md:gap-0.5 max-md:px-1 max-md:py-1"
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
              hidden
              onChange={(e) => {
                p.addFiles(Array.from(e.target.files ?? []))
                e.target.value = ''
              }}
            />
            <PollButton onClick={p.onOpenPoll} />
            <ComposerInput
              inputRef={inputRef}
              value={draft}
              placeholder={composerPlaceholder(replyingTo !== null, p.replyAuthor, p.placeholder)}
              menu={menu}
              replying={replyingTo !== null}
              onChange={(text, caret) => {
                setDraft(text)
                typing.onDraftChange(text)
                menu.onInput(text, caret)
              }}
              onPaste={p.onPaste}
              onEditLast={p.onEditLast}
              onCancelReply={() => setReplyState(null)}
            />
            <MediaPickerButton onClick={() => setMediaPickerOpen((v) => !v)} />
            <VoiceButton
              show={permissions.canAttach}
              room={room}
              disabled={send.sendingVoice || slowmode.blocked}
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
