import { useRef } from 'react'
import {
  PRESET_BACKGROUNDS,
  type BackgroundPreset,
  type CustomBackground,
  type VideoBackground
} from '../lib/videoBackground'
import {
  BlurIcon,
  CheckIcon,
  CircleSlashIcon,
  ImageAddIcon
} from '../../../shared/ui/icons'
import CloseButton from '../../../shared/ui/CloseButton'

const BASE_TILE =
  'relative flex aspect-video w-full cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border-2 text-ds-xs font-medium transition-colors'

const tile = (selected: boolean): string =>
  `${BASE_TILE} ${
    selected
      ? 'border-brand text-strong'
      : 'border-transparent text-secondary hover:border-fg/20 hover:text-strong'
  }`

/**
 * "Fundo do vídeo" (como no Discord): Nenhum, Borrar, Personalizado e as
 * imagens prontas e salvas. Controlado: quem usa decide se vale na hora
 * (Configurações) ou só ao confirmar (modal).
 */
function BackgroundPicker({
  value,
  customs,
  presets = PRESET_BACKGROUNDS,
  error,
  onChange,
  onUpload,
  onRemoveCustom
}: {
  value: VideoBackground
  customs: readonly CustomBackground[]
  presets?: readonly BackgroundPreset[]
  error?: string | null
  onChange: (bg: VideoBackground) => void
  onUpload: (file: File) => void
  onRemoveCustom: (id: string) => void
}): React.JSX.Element {
  const fileRef = useRef<HTMLInputElement>(null)
  const isImage = (kind: 'preset' | 'custom', id: string): boolean =>
    value.mode === 'image' && value.image?.kind === kind && value.image.id === id

  return (
    <div role="group" aria-label="Fundo do vídeo" className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          aria-pressed={value.mode === 'none'}
          onClick={() => onChange({ mode: 'none', image: null })}
          className={`${tile(value.mode === 'none')} bg-fg/5`}
        >
          <CircleSlashIcon size={24} />
          Nenhum
        </button>
        <button
          type="button"
          aria-pressed={value.mode === 'blur'}
          onClick={() => onChange({ mode: 'blur', image: null })}
          className={`${tile(value.mode === 'blur')} bg-fg/5`}
        >
          <BlurIcon size={24} />
          Borrar
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className={`${tile(false)} bg-brand/15`}
        >
          <ImageAddIcon size={24} />
          Personalizado
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onUpload(file)
            e.target.value = ''
          }}
        />
        {customs.map((c) => {
          const selected = isImage('custom', c.id)
          return (
            <div key={c.id} className="group relative">
              <button
                type="button"
                aria-pressed={selected}
                aria-label="Imagem personalizada"
                onClick={() => onChange({ mode: 'image', image: { kind: 'custom', id: c.id } })}
                className={tile(selected)}
              >
                <img
                  src={c.dataUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
                {c.animated && (
                  <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-ds-xxs font-bold text-white">
                    GIF
                  </span>
                )}
                {selected && <Selected />}
              </button>
              <CloseButton
                variant="media"
                size="xs"
                label="Remover imagem"
                onClick={() => onRemoveCustom(c.id)}
                className="absolute right-1 top-1 [@media(hover:hover)]:opacity-0 focus-visible:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
              />
            </div>
          )
        })}
        {presets.map((p) => {
          const selected = isImage('preset', p.id)
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={selected}
              aria-label={p.label}
              title={p.label}
              onClick={() => onChange({ mode: 'image', image: { kind: 'preset', id: p.id } })}
              className={tile(selected)}
            >
              <img src={p.dataUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              {selected && <Selected />}
            </button>
          )
        })}
      </div>
      {error && (
        <p role="alert" className="text-ds-xs text-warning">
          {error}
        </p>
      )}
    </div>
  )
}

function Selected(): React.JSX.Element {
  return (
    <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white">
      <CheckIcon className="h-3 w-3" />
    </span>
  )
}

export default BackgroundPicker
