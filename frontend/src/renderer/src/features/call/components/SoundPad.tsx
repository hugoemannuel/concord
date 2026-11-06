import type { SoundboardItem } from '../api/soundboard'
import { FavoriteStarIcon, SoundboardIcon, TrashIcon } from '../../../shared/ui/icons'
import { previewKeyProps } from '../../emojis/lib/gridNav'

/** Depois da duração: o servidor de origem (favorito de fora) ou quem enviou. */
function subtitleSuffix(sound: SoundboardItem, origin?: string): string {
  const who = origin || sound.uploader_name
  return who ? ` · ${who}` : ''
}

/** Um som da mesa de áudio: tocar, atalho, estrela e excluir. */
export default function SoundPad({
  sound,
  origin,
  isFavorite,
  keybind,
  recordingKey,
  canDelete,
  isPlaying,
  onTrigger,
  onToggleFavorite,
  onStartRecordKey,
  onDelete
}: {
  sound: SoundboardItem
  /** Nome do servidor de origem, para favorito de outro servidor. */
  origin?: string
  isFavorite: boolean
  keybind?: string
  recordingKey: boolean
  canDelete: boolean
  isPlaying: boolean
  onTrigger: () => void
  onToggleFavorite: () => void
  onStartRecordKey: () => void
  onDelete: () => void
}): React.JSX.Element {
  return (
    <div
      className={`group relative flex flex-col justify-between rounded-xl border p-2.5 transition-all ${
        isPlaying
          ? 'border-success bg-success/15 shadow-[0_0_16px_rgba(35,165,90,0.25)]'
          : 'border-subtle bg-fg/[0.04] hover:border-normal hover:bg-fg/[0.08]'
      }`}
    >
      <button
        type="button"
        onClick={onTrigger}
        className="flex w-full cursor-pointer items-center gap-2.5 text-left"
        title={`Tocar "${sound.name}" para todos na chamada`}
        {...previewKeyProps(sound.id)}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-input text-ds-lg">
          {sound.emoji || <SoundboardIcon size={20} className="text-muted" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-ds-xs font-bold text-strong">{sound.name}</p>
          <p className="truncate text-ds-xxs text-muted">
            {(sound.duration_ms / 1000).toFixed(1)}s{subtitleSuffix(sound, origin)}
          </p>
        </div>
      </button>

      <div className="mt-2 flex items-center justify-between gap-1 border-t border-subtle pt-1.5">
        <button
          type="button"
          onClick={onStartRecordKey}
          title="Definir atalho de teclado (ex.: F1, Alt+1). Clique e pressione a combinação ou Backspace para limpar."
          className={`cursor-pointer truncate rounded px-1.5 py-0.5 text-ds-xxs font-semibold transition-colors ${
            recordingKey
              ? 'animate-pulse bg-brand text-white'
              : keybind
                ? 'bg-fg/15 text-normal hover:bg-fg/25'
                : 'bg-fg/5 text-muted hover:bg-fg/10 hover:text-normal'
          }`}
        >
          {recordingKey ? 'Tecla…' : keybind || 'Atalho'}
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleFavorite}
            aria-label={isFavorite ? 'Remover dos favoritos' : 'Favoritar som'}
            title={isFavorite ? 'Remover dos favoritos' : 'Favoritar'}
            className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded transition-colors ${
              isFavorite
                ? 'text-warning hover:bg-fg/10'
                : 'text-muted hover:bg-fg/10 hover:text-normal'
            }`}
          >
            <FavoriteStarIcon className="h-3.5 w-3.5" filled={isFavorite} />
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Excluir som ${sound.name}`}
              title="Excluir som"
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted transition-colors hover:bg-danger/20 hover:text-danger"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
