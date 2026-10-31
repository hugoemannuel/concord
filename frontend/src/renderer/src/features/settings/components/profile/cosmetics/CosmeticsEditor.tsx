import { useRef } from 'react'
import type { CosmeticImageKind } from '../../../../profile/api/users'
import { PROFILE_IMAGE_TYPES } from '../../../../profile/lib/profileValidation'
import { useCosmeticsEditor } from '../../../hooks/useCosmeticsEditor'
import ImageCropModal from '../../ImageCropModal'
import CosmeticsModal from './CosmeticsModal'

const KINDS: CosmeticImageKind[] = ['nameplate', 'decoration']
const FILE_LABEL: Record<CosmeticImageKind, string> = {
  nameplate: 'Arquivo da faixa',
  decoration: 'Arquivo da moldura'
}

/** O modal "Faixa e moldura" ligado à sessão, com os arquivos e o recorte. */
export default function CosmeticsEditor({
  onClose
}: {
  onClose: () => void
}): React.JSX.Element | null {
  const inputs = {
    nameplate: useRef<HTMLInputElement | null>(null),
    decoration: useRef<HTMLInputElement | null>(null)
  }
  const editor = useCosmeticsEditor((kind) => inputs[kind].current?.click())
  if (!editor.user) return null
  return (
    <>
      <CosmeticsModal
        user={editor.user}
        busy={editor.busy}
        onChoose={editor.choose}
        onPickDecoration={() => inputs.decoration.current?.click()}
        onRemove={editor.remove}
        onClose={onClose}
      />
      {KINDS.map((kind) => (
        <input
          key={kind}
          ref={inputs[kind]}
          type="file"
          accept={PROFILE_IMAGE_TYPES.join(',')}
          className="hidden"
          aria-label={FILE_LABEL[kind]}
          onChange={(e) => {
            editor.pickFile(kind, e.target.files?.[0])
            e.target.value = ''
          }}
        />
      ))}
      {editor.cropping && (
        <ImageCropModal
          file={editor.cropping.file}
          src={editor.cropping.src}
          kind={editor.cropping.kind}
          onCancel={() => editor.closeCrop()}
          onApply={(change) => editor.closeCrop(change)}
        />
      )}
    </>
  )
}
