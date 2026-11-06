import type { ChangeEvent, RefObject } from 'react'
import Button from '../../../shared/ui/Button'
import { PauseIcon, PlayIcon } from '../../../shared/ui/icons'
import { formatBytes } from '../../chat/lib/attachments'
import { formatSoundDuration } from '../../expressions/lib/expressionRules'

// Partes do formulário de "Adicionar som" (SoundboardUploadModal).

// design-allow: emojis sugeridos para o botão do som (conteúdo, não ícone)
const PRESET_EMOJIS = ['🎺', '😂', '🔥', '💀', '🎉', '👏', '🚨', '💥', '🥁', '🐸', '🎸', '🔔']

/** Emoji que um som novo leva até a pessoa escolher outro. */
export const DEFAULT_SOUND_EMOJI = PRESET_EMOJIS[0]

const LABEL = 'mb-1.5 block text-ds-sm font-medium text-muted'

/** Escolher o arquivo, ver duração/tamanho e ouvir a prévia. */
export function SoundFileField({
  fileInputRef,
  previewAudioRef,
  file,
  durationMs,
  previewUrl,
  previewPlaying,
  onPick,
  onTogglePreview,
  onPreviewEnded
}: {
  fileInputRef: RefObject<HTMLInputElement | null>
  previewAudioRef: RefObject<HTMLAudioElement | null>
  file: File | null
  durationMs: number | null
  previewUrl: string | null
  previewPlaying: boolean
  onPick: (e: ChangeEvent<HTMLInputElement>) => void
  onTogglePreview: () => void
  onPreviewEnded: () => void
}): React.JSX.Element {
  return (
    <div>
      <label className={LABEL}>Arquivo de áudio (máx. 15s e 5 MB)</label>
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/mp4,audio/x-m4a,audio/webm,.mp3,.wav,.ogg,.m4a,.webm"
        className="hidden"
        onChange={onPick}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-1 cursor-pointer items-center justify-between rounded-xl border border-dashed border-normal bg-fg/5 px-3 py-2.5 text-left text-ds-xs text-normal transition-colors hover:border-strong hover:bg-fg/10"
        >
          <span className="truncate">{file ? file.name : 'Escolher arquivo (.mp3, .wav, .ogg, .m4a)'}</span>
          {durationMs !== null && file && (
            <span className="ml-2 shrink-0 rounded bg-fg/10 px-1.5 py-0.5 text-ds-xs font-semibold text-secondary">
              {formatSoundDuration(durationMs)} · {formatBytes(file.size)}
            </span>
          )}
        </button>
        {previewUrl && (
          <button
            type="button"
            onClick={onTogglePreview}
            title={previewPlaying ? 'Parar prévia' : 'Ouvir prévia'}
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-brand text-white transition-colors hover:bg-brand-hover"
          >
            {previewPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
          </button>
        )}
      </div>
      {previewUrl && (
        <audio ref={previewAudioRef} src={previewUrl} onEnded={onPreviewEnded} className="hidden" />
      )}
    </div>
  )
}

/** Emoji do botão: os sugeridos ou um digitado. */
export function SoundEmojiField({
  emoji,
  onChange
}: {
  emoji: string
  onChange: (emoji: string) => void
}): React.JSX.Element {
  return (
    <div>
      <label className={LABEL}>Ícone / Emoji</label>
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESET_EMOJIS.map((em) => (
          <button
            key={em}
            type="button"
            onClick={() => onChange(em)}
            className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-ds-md transition-colors ${
              emoji === em ? 'bg-brand text-white ring-2 ring-fg/40' : 'bg-fg/5 hover:bg-fg/15'
            }`}
          >
            {em}
          </button>
        ))}
        <input
          type="text"
          value={emoji}
          onChange={(e) => onChange(e.target.value.slice(0, 4))}
          // design-allow: exemplo de emoji no campo de emoji
          placeholder="🎵"
          aria-label="Emoji personalizado"
          className="h-8 w-12 rounded-lg border border-subtle bg-fg/5 text-center text-ds-sm text-strong focus:border-brand focus:outline-none"
        />
      </div>
    </div>
  )
}

/** Cancelar e salvar: salvar só com arquivo e nome. */
export function SoundUploadActions({
  file,
  name,
  submitting,
  onCancel
}: {
  file: File | null
  name: string
  submitting: boolean
  onCancel: () => void
}): React.JSX.Element {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancelar
      </Button>
      <Button type="submit" disabled={!file || !name.trim() || submitting}>
        {submitting ? 'Enviando…' : 'Salvar na mesa'}
      </Button>
    </div>
  )
}
