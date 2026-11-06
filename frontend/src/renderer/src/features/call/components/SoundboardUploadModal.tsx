import { useEffect, useRef, useState } from 'react'
import { MAX_SOUNDBOARD_NAME_LEN } from '../api/soundboard'
import { selectSoundFile } from '../lib/soundUpload'
import { useSoundboardStore } from '../store/soundboardStore'
import { showToast } from '../../../shared/store/toastStore'
import { useObjectUrl } from '../../../shared/hooks/useObjectUrl'
import Input from '../../../shared/ui/Input'
import Modal from '../../../shared/ui/Modal'
import {
  DEFAULT_SOUND_EMOJI,
  SoundEmojiField,
  SoundFileField,
  SoundUploadActions
} from './SoundboardUploadFields'

interface SoundboardUploadModalProps {
  open: boolean
  serverId: string
  onClose: () => void
}

function SoundboardUploadModal({
  open,
  serverId,
  onClose
}: SoundboardUploadModalProps): React.JSX.Element | null {
  const uploadSound = useSoundboardStore((s) => s.uploadSound)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [durationMs, setDurationMs] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState(DEFAULT_SOUND_EMOJI)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const previewUrl = useObjectUrl(file)

  useEffect(() => {
    if (!open) {
      // Fechou o modal: zera o formulário para a próxima abertura.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFile(null)
      setDurationMs(null)
      setName('')
      setEmoji(DEFAULT_SOUND_EMOJI)
      setPreviewPlaying(false)
      setSubmitting(false)
      setError(null)
    }
  }, [open])

  if (!open) return null

  const handleSelectFile = (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const selected = e.target.files?.[0]
    e.target.value = ''
    return selectSoundFile(selected, name, {
      setError,
      accept: (picked, duration) => {
        setFile(picked)
        setDurationMs(duration)
        setPreviewPlaying(false)
      },
      suggestName: setName
    })
  }

  const togglePreview = (): void => {
    const el = previewAudioRef.current
    if (!el || !previewUrl) return
    if (previewPlaying) {
      el.pause()
      el.currentTime = 0
      setPreviewPlaying(false)
    } else {
      el.currentTime = 0
      void el
        .play()
        .then(() => setPreviewPlaying(true))
        .catch(() => setPreviewPlaying(false))
    }
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!file || !durationMs || submitting) return
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Digite um nome para o som.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await uploadSound(serverId, file, {
        name: trimmedName,
        emoji: emoji.trim() || undefined,
        duration_ms: durationMs,
        filename: file.name
      })
      showToast.success('Som adicionado à mesa de áudio!')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o áudio.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open title="Adicionar som à mesa de áudio" onClose={onClose}>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <SoundFileField
          fileInputRef={fileInputRef}
          previewAudioRef={previewAudioRef}
          file={file}
          durationMs={durationMs}
          previewUrl={previewUrl}
          previewPlaying={previewPlaying}
          onPick={(e) => void handleSelectFile(e)}
          onTogglePreview={togglePreview}
          onPreviewEnded={() => setPreviewPlaying(false)}
        />

        <div>
          <label className="mb-1.5 block text-ds-sm font-medium text-muted">
            Nome do botão
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, MAX_SOUNDBOARD_NAME_LEN))}
            placeholder="Ex.: Corneta, Risada, Tambores…"
            maxLength={MAX_SOUNDBOARD_NAME_LEN}
            required
          />
        </div>

        <SoundEmojiField emoji={emoji} onChange={setEmoji} />

        {error && <p className="text-ds-xs font-medium text-danger">{error}</p>}

        <SoundUploadActions
          file={file}
          name={name}
          submitting={submitting}
          onCancel={onClose}
        />
      </form>
    </Modal>
  )
}

export default SoundboardUploadModal
