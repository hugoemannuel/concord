import { useEffect, useRef, useState } from 'react'
import Button from '../../../shared/ui/Button'
import { ImageAddIcon, TrashIcon } from '../../../shared/ui/icons'
import { BANNER_ACCEPT } from '../api/events'
import { uploadBanner } from '../lib/bannerUpload'
import EventBanner from './EventBanner'

/** Prévia local do arquivo escolhido (a URL é liberada ao trocar ou fechar). */
function useLocalPreview(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!file) return setUrl(null)
    const next = URL.createObjectURL(file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file])
  return url
}

/** Escolhe a imagem do banner: envia na hora e guarda só o id do arquivo no formulário. */
export default function BannerField({
  serverId,
  bannerId,
  onChange,
  onError
}: {
  serverId: string
  bannerId: string | null
  onChange: (bannerId: string | null) => void
  onError: (message: string) => void
}): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const preview = useLocalPreview(file)

  const pick = async (picked: File | undefined): Promise<void> => {
    if (!picked) return
    setUploading(true)
    const result = await uploadBanner(serverId, picked)
    setUploading(false)
    if (!result.ok) return onError(result.error)
    onChange(result.bannerId)
    setFile(picked)
  }

  const remove = (): void => {
    setFile(null)
    onChange(null)
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-ds-sm font-medium text-secondary">Banner (opcional)</span>
      {preview && bannerId ? (
        <img
          src={preview}
          alt=""
          width={1280}
          height={720}
          className="aspect-video w-full rounded-lg object-cover md:max-w-sm"
        />
      ) : (
        <EventBanner bannerId={bannerId} className="rounded-lg md:max-w-sm" />
      )}
      <input
        ref={inputRef}
        type="file"
        accept={BANNER_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label="Arquivo do banner"
        onChange={(e) => {
          void pick(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" icon={ImageAddIcon} loading={uploading} onClick={() => inputRef.current?.click()}>
          Escolher imagem
        </Button>
        {bannerId && (
          <Button type="button" variant="ghost" icon={TrashIcon} onClick={remove}>
            Remover imagem
          </Button>
        )}
      </div>
    </div>
  )
}
