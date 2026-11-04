import { useRef } from 'react'
import { API_BASE_URL } from '../../../shared/lib/config'
import Button from '../../../shared/ui/Button'
import { CheckIcon, ImageIcon, TrashIcon } from '../../../shared/ui/icons'
import { THEME_IMAGE_ACCEPT } from '../../appearance/lib/themeImageFile'
import type { ServerArt } from '../api/serverProfile'
import { useProfileImageUpload } from '../hooks/useProfileImageUpload'
import { ART_PRESETS, artBackground } from '../lib/serverArt'

/** A paleta de degradês e a imagem própria (a imagem ganha). */
export default function ArtPicker({
  serverId,
  label,
  value,
  onChange
}: {
  serverId: string
  /** O que está sendo escolhido, para o leitor de tela ("Banner"). */
  label: string
  value: ServerArt
  onChange: (art: ServerArt) => void
}): React.JSX.Element {
  const fileRef = useRef<HTMLInputElement>(null)
  const upload = useProfileImageUpload(serverId, (image) => onChange({ ...value, image }))
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label={`${label}: degradês`} className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {ART_PRESETS.map((preset) => {
          const selected = !value.image && value.preset === preset.id
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={selected}
              aria-label={preset.label}
              title={preset.label}
              onClick={() => onChange({ preset: preset.id, image: '' })}
              style={artBackground({ preset: preset.id, image: '' }, API_BASE_URL)}
              className={`focus-ring relative flex h-12 cursor-pointer items-center justify-center rounded-md border transition-transform hover:scale-105 on-media ${
                selected ? 'border-strong ring-2 ring-brand' : 'border-subtle'
              }`}
            >
              {selected && <CheckIcon size={16} />}
            </button>
          )
        })}
      </div>
      {value.image && (
        <div className="h-20 w-full rounded-md border border-subtle" style={artBackground(value, API_BASE_URL)} aria-hidden="true" />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={ImageIcon}
          loading={upload.busy}
          onClick={() => fileRef.current?.click()}
        >
          {value.image ? 'Trocar imagem' : 'Enviar imagem'}
        </Button>
        {value.image && (
          <Button
            variant="ghost"
            size="sm"
            icon={TrashIcon}
            onClick={() => onChange({ ...value, image: '' })}
          >
            Remover imagem
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept={THEME_IMAGE_ACCEPT}
          hidden
          aria-label={`${label}: arquivo da imagem`}
          onChange={(e) => {
            void upload.pick(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
