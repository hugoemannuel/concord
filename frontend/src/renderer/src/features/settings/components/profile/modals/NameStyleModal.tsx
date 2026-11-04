import { useState } from 'react'
import Button from '../../../../../shared/ui/Button'
import { DiceIcon } from '../../../../../shared/ui/icons'
import type { NameStyle } from '../../../../profile/lib/nameStyle'
import { surpriseNameStyle } from '../../../../profile/lib/nameStylePicker'
import type { ProfileDraft } from '../../../../profile/lib/profileValidation'
import { patchErrors, patchedDraft } from '../../../lib/draftPatch'
import NameStyleEditor from '../../NameStyleEditor'
import { DisplayNameField } from '../ProfileTextFields'
import EditModalShell from './EditModalShell'
import MessagePreview from './MessagePreview'
import ProfilePreview, { type PreviewBase } from '../ProfilePreview'

export interface NamePatch {
  display_name: string
  name_style: NameStyle
}

/**
 * Nome de exibição no padrão do Discord: o texto e o estilo (fonte, efeito e
 * cor) à esquerda; o cartão e uma mensagem do chat ao vivo à direita.
 * "Surpreenda-me" sorteia um estilo; "Aplicar" devolve o nome e o estilo.
 */
export default function NameStyleModal({
  base,
  draft,
  busy,
  onClose,
  onApply
}: {
  base: PreviewBase
  draft: ProfileDraft
  busy?: boolean
  onClose: () => void
  onApply: (patch: NamePatch) => void
}): React.JSX.Element {
  const [name, setName] = useState(draft.display_name)
  const [style, setStyle] = useState(draft.name_style)
  const merged = patchedDraft(draft, { display_name: name, name_style: style })
  const error = patchErrors(merged, ['display_name']).display_name
  const shownName = name.trim() || base.user.username

  return (
    <EditModalShell
      title="Nome de exibição"
      size="xl"
      busy={busy}
      canApply={!error}
      onClose={onClose}
      onApply={() => onApply({ display_name: name, name_style: style })}
      extraAction={
        <Button
          type="button"
          variant="ghost"
          className="inline-flex min-h-10 items-center gap-1.5"
          onClick={() => setStyle((current) => surpriseNameStyle(current))}
        >
          <DiceIcon size={16} />
          Surpreenda-me
        </Button>
      }
      preview={
        <>
          <ProfilePreview
            user={base.user}
            draft={merged}
            avatarUrl={base.avatarUrl}
            bannerUrl={base.bannerUrl}
          />
          <MessagePreview name={shownName} style={style} avatarUrl={base.avatarUrl} />
        </>
      }
    >
      <DisplayNameField value={name} error={error} disabled={base.nameLocked} onChange={setName} />
      <NameStyleEditor value={style} onChange={setStyle} />
    </EditModalShell>
  )
}
