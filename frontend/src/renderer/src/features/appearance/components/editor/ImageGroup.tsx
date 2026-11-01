import { useId, useRef } from 'react'
import Button from '../../../../shared/ui/Button'
import { ImageAddIcon, TrashIcon } from '../../../../shared/ui/icons'
import { API_BASE_URL } from '../../../../shared/lib/config'
import { RangeField } from '../../../settings/components/profile/controls'
import { useThemeImageUpload } from '../../hooks/useThemeImageUpload'
import type { Scheme } from '../../lib/palette'
import { MIN_IMAGE_DIM } from '../../lib/paletteSurfaces'
import { imageOrigin, themeImageSrc } from '../../lib/themeImage'
import { THEME_IMAGE_ACCEPT } from '../../lib/themeImageFile'
import { IMAGE_BLUR_MAX, IMAGE_DIM_MAX } from '../../lib/themeInput'
import { EditorGroup } from './EditorGroup'
import type { GroupProps } from './types'

const ORIGIN = imageOrigin(API_BASE_URL)

/** Escurecer (ou clarear) e desfocar a imagem escolhida. */
function ImageControls({ draft, update, scheme }: GroupProps & { scheme: Scheme }): React.JSX.Element {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <RangeField
        label={scheme === 'dark' ? 'Escurecer' : 'Clarear'}
        value={Math.max(MIN_IMAGE_DIM, draft.imageDim)}
        min={MIN_IMAGE_DIM}
        max={IMAGE_DIM_MAX}
        step={5}
        display={`${Math.max(MIN_IMAGE_DIM, draft.imageDim)}%`}
        onChange={(imageDim) => update({ imageDim }, 'imageDim')}
      />
      <RangeField
        label="Desfocar"
        value={draft.imageBlur}
        min={0}
        max={IMAGE_BLUR_MAX}
        display={draft.imageBlur === 0 ? 'Desligado' : `${draft.imageBlur} px`}
        onChange={(imageBlur) => update({ imageBlur }, 'imageBlur')}
      />
    </div>
  )
}

/** Imagem de fundo do app: enviada para a conta, com um véu que garante a leitura. */
export function ImageGroup({ draft, update, scheme }: GroupProps & { scheme: Scheme }): React.JSX.Element {
  const input = useRef<HTMLInputElement>(null)
  const errorId = useId()
  const upload = useThemeImageUpload((image) => update({ image }, 'image'))
  const src = themeImageSrc(draft.image, ORIGIN)
  return (
    <EditorGroup title="Imagem de fundo">
      <p className="text-ds-xs text-muted">
        Uma foto ou arte no fundo do app, atrás dos painéis. Um véu {scheme === 'dark' ? 'escuro' : 'claro'} fica por
        cima dela para o texto continuar fácil de ler (nunca menos de {MIN_IMAGE_DIM}%).
      </p>
      {src && (
        <img src={src} alt="Imagem de fundo escolhida" className="aspect-video w-full rounded-lg border border-subtle object-cover" />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          icon={ImageAddIcon}
          loading={upload.busy}
          aria-describedby={upload.error ? errorId : undefined}
          onClick={() => input.current?.click()}
        >
          {src ? 'Trocar imagem' : 'Escolher imagem'}
        </Button>
        {src && (
          <Button size="sm" variant="ghost" icon={TrashIcon} onClick={() => update({ image: '' }, 'image')}>
            Tirar imagem
          </Button>
        )}
        <input
          ref={input}
          type="file"
          accept={THEME_IMAGE_ACCEPT}
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void upload.pick(file)
          }}
        />
      </div>
      {upload.error && (
        <p id={errorId} role="alert" className="text-ds-xs text-danger">
          {upload.error}
        </p>
      )}
      <p className="text-ds-xs text-muted">PNG, JPEG ou WEBP. A imagem fica guardada na sua conta.</p>
      {src && <ImageControls draft={draft} update={update} scheme={scheme} />}
    </EditorGroup>
  )
}
