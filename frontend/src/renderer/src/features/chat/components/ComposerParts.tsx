import type { ReactNode } from 'react'
import type { Message } from '../api/messages'
import type { ServerSticker } from '../api/stickers'
import type { GifItem } from '../api/gifs'
import { PaperclipIcon, PollIcon, SmileyIcon } from '../../../shared/ui/icons'
import SlashSuggestions from '../../music/components/SlashSuggestions'
import { composerCommands } from '../lib/chatPaneView'
import UnifiedMediaPickerPopover from './UnifiedMediaPickerPopover'
import VoiceRecordButton from './VoiceRecordButton'
import MobileSheet from '../../../shared/ui/MobileSheet'
import CloseButton from '../../../shared/ui/CloseButton'
import { messagePreviewParts } from '../lib/polls'
import PreviewText from './PreviewText'
import { submitLabel } from '../lib/chatPaneView'
import IconButton from '../../../shared/ui/IconButton'

// Peças do campo de mensagem do ChatPane: cada uma decide sozinha se aparece.

/** Sem poder enviar (permissão, DM bloqueada), o aviso fica no lugar do campo. */
export function ComposerGate({
  disabledReason,
  children
}: {
  disabledReason: string | undefined
  children: ReactNode
}): React.JSX.Element {
  return disabledReason ? (
    <div className="rounded-xl border border-subtle bg-input px-4 py-3 text-center text-ds-sm text-muted">
      {disabledReason}
    </div>
  ) : (
    <>{children}</>
  )
}

/** "Respondendo a @fulano" em cima do campo, com o botão de cancelar. */
export function ReplyBar({
  replyingTo,
  authorName,
  onCancel
}: {
  replyingTo: Message | null
  authorName: string
  onCancel: () => void
}): React.JSX.Element | null {
  if (!replyingTo) return null
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2 rounded-lg border border-subtle bg-floating px-3 py-1.5 text-ds-sm text-secondary">
      <div className="min-w-0 truncate">
        Respondendo a <span className="font-semibold text-strong">@{authorName}</span>
        <PreviewText preview={messagePreviewParts(replyingTo)} className="ml-2 text-muted" />
      </div>
      <CloseButton
        label="Cancelar resposta"
        title="Cancelar resposta (Esc)"
        size="sm"
        onClick={onCancel}
      />
    </div>
  )
}

/** Emojis, GIFs e figurinhas, aberto pelo botão do campo. */
export function MediaPicker({
  open,
  serverId,
  onSelectEmoji,
  onSelectGif,
  onSelectSticker,
  onClose
}: {
  open: boolean
  serverId?: string
  onSelectEmoji: (emoji: string) => void
  onSelectGif: (gif: GifItem) => void
  onSelectSticker: (sticker: ServerSticker) => void
  onClose: () => void
}): React.JSX.Element | null {
  if (!open) return null
  return (
    <MobileSheet>
      <UnifiedMediaPickerPopover
        serverId={serverId}
        onSelectEmoji={onSelectEmoji}
        onSelectGif={onSelectGif}
        onSelectSticker={onSelectSticker}
        onClose={onClose}
      />
    </MobileSheet>
  )
}

/** Comandos do "/" (Maestro em canal, /tts com a permissão), sem menu de @ aberto. */
export function SlashCommandSuggestions({
  isChannel,
  canSendTTS,
  mentionOpen,
  input,
  onPick
}: {
  isChannel: boolean
  canSendTTS: boolean
  mentionOpen: boolean
  input: string
  onPick: (command: string) => void
}): React.JSX.Element | null {
  if (mentionOpen) return null
  return (
    <SlashSuggestions
      input={input}
      commands={composerCommands(isChannel, canSendTTS)}
      onPick={onPick}
    />
  )
}

/** Anexar arquivo (só com ATTACH_FILES). */
export function AttachButton({
  show,
  onClick
}: {
  show: boolean
  onClick: () => void
}): React.JSX.Element | null {
  if (!show) return null
  return (
    <IconButton icon={PaperclipIcon} label="Anexar arquivo" onClick={onClick} className="max-md:p-2" />
  )
}

/** Abre o modal de criar enquete. */
export function PollButton({ onClick }: { onClick: () => void }): React.JSX.Element {
  return (
    <IconButton icon={PollIcon} label="Criar enquete" onClick={onClick} className="max-md:p-2" />
  )
}

/** Abre e fecha o seletor de emojis, GIFs e figurinhas. */
export function MediaPickerButton({ onClick }: { onClick: () => void }): React.JSX.Element {
  return (
    <IconButton icon={SmileyIcon} label="Emojis, GIFs e Figurinhas" onClick={onClick} className="max-md:p-2" />
  )
}

/** Gravar áudio (é um anexo: só com ATTACH_FILES). Recomeça a cada sala. */
export function VoiceButton({
  show,
  room,
  disabled,
  onRecorded
}: {
  show: boolean
  room: string
  disabled: boolean
  onRecorded: (blob: Blob, durationMs: number) => Promise<void>
}): React.JSX.Element | null {
  if (!show) return null
  // Segurar para gravar: sem o navegador roubar o gesto para rolar (touch-none)
  // e com 36 px no celular.
  return (
    <span className="contents [&>button]:touch-none max-md:[&>button]:p-2">
      <VoiceRecordButton key={room} disabled={disabled} onRecorded={onRecorded} />
    </span>
  )
}

/** Enviar: desligado enquanto envia ou sem nada para enviar. */
export function SubmitButton({
  sending,
  submittable,
  uploading
}: {
  sending: boolean
  submittable: boolean
  uploading: boolean
}): React.JSX.Element {
  return (
    <button
      type="submit"
      disabled={sending || !submittable}
      className="cursor-pointer rounded-lg bg-brand px-3 py-1.5 text-ds-sm font-medium text-white transition-all hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40 max-md:min-h-9 max-md:px-2.5"
    >
      {submitLabel(uploading, sending)}
    </button>
  )
}
