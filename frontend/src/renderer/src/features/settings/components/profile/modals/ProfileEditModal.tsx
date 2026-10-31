import type { ChosenStatus } from '../../../../friends/lib/presenceStatus'
import { draftFromProfile } from '../../../../profile/lib/profileValidation'
import { changeMyStatus } from '../../../../profile/store/meActions'
import type { DraftPatch } from '../../../lib/draftPatch'
import type { PreviewBase } from '../ProfilePreview'
import CosmeticsEditor from '../cosmetics/CosmeticsEditor'
import EntranceSoundModal from './EntranceSoundModal'
import FieldModal from './FieldModal'
import NameStyleModal from './NameStyleModal'
import { SPOT_FIELDS, type FieldModalId } from './spotFields'
import StatusModal from './StatusModal'

/** Cada editor de Configurações → Perfis que abre num modal. */
export type ProfileModalId = 'name' | 'sound' | 'status' | 'cosmetics' | FieldModalId

/**
 * O modal aberto (pela parte do cartão ou pelo bloco da coluna). "Aplicar"
 * salva na hora e fecha quando o servidor confirma; com erro, o modal fica
 * aberto com o que a pessoa digitou.
 */
export default function ProfileEditModal({
  modal,
  base,
  busy,
  onClose,
  onApply
}: {
  modal: ProfileModalId | null
  base: PreviewBase
  busy: boolean
  onClose: () => void
  onApply: (patch: DraftPatch) => Promise<boolean>
}): React.JSX.Element | null {
  if (!modal) return null
  if (modal === 'sound') return <EntranceSoundModal onClose={onClose} />
  if (modal === 'cosmetics') return <CosmeticsEditor onClose={onClose} />
  if (modal === 'status') {
    return (
      <StatusModal
        status={(base.user.status as ChosenStatus) ?? 'online'}
        onClose={onClose}
        onSelect={(s) => void changeMyStatus(s)}
      />
    )
  }
  const draft = draftFromProfile(base.user)
  const apply = async (patch: DraftPatch): Promise<void> => {
    if (await onApply(patch)) onClose()
  }
  if (modal === 'name') {
    return (
      <NameStyleModal
        base={base}
        draft={draft}
        busy={busy}
        onClose={onClose}
        onApply={(patch) => void apply(patch)}
      />
    )
  }
  return (
    <FieldModal
      key={modal}
      field={SPOT_FIELDS[modal]}
      base={base}
      draft={draft}
      busy={busy}
      onClose={onClose}
      onApply={(patch) => void apply(patch)}
    />
  )
}
