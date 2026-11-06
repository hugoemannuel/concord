import { useState } from 'react'
import Modal from '../../../shared/ui/Modal'
import Button from '../../../shared/ui/Button'
import Input from '../../../shared/ui/Input'
import { EMOJI_ACCEPT } from '../api/emojis'
import { useEmojiStore } from '../store/emojiStore'
import { pickEmojiFile, sendEmoji } from '../lib/emojiUpload'
import { useObjectUrl } from '../../../shared/hooks/useObjectUrl'

/** "Novo emoji": imagem + nome, enviado ao servidor aberto. */
export default function EmojiUploadModal({
  serverId,
  onClose
}: {
  serverId: string
  onClose: () => void
}): React.JSX.Element {
  const upload = useEmojiStore((s) => s.upload)
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const preview = useObjectUrl(file)

  const pick = (selected: File | undefined): void => {
    const picked = pickEmojiFile(selected, name)
    setError(picked.error)
    if (picked.file) {
      setFile(picked.file)
      setName(picked.name)
    }
  }

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setSubmitting(true)
    const failure = await sendEmoji(upload, serverId, name, file)
    if (!failure) return onClose()
    setError(failure)
    setSubmitting(false)
  }

  return (
    <Modal open title="Novo emoji" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && (
          <div role="alert" className="rounded-lg border border-danger/20 bg-danger/10 p-2.5 text-ds-xs text-danger">
            {error}
          </div>
        )}
        <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/5 p-4 text-center transition-colors hover:border-brand/50 hover:bg-white/10 focus-within:border-brand">
          <input
            type="file"
            accept={EMOJI_ACCEPT}
            className="sr-only"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          {preview && <img src={preview} alt="" width={64} height={64} className="h-16 w-16 object-contain" />}
          <span className="text-ds-xs text-muted">
            {/* design-allow: × da dimensão em pixels, não é ícone */}
            PNG, JPEG, WEBP, AVIF ou GIF, até 256 KB. O ideal é 128×128.
          </span>
        </label>
        <Input
          label="Nome"
          name="emoji-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="nome_do_emoji"
          maxLength={32}
          autoComplete="off"
          spellCheck={false}
        />
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={submitting || !file || !name}>
            Enviar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
