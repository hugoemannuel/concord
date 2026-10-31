import type { User } from '../../../../auth/store/authStore'
import type { CosmeticImageKind } from '../../../../profile/api/users'
import type { NameplateMode } from '../../../../profile/lib/cosmetics'
import Button from '../../../../../shared/ui/Button'
import Modal from '../../../../../shared/ui/Modal'
import SectionHeader from '../../../../../shared/ui/SectionHeader'
import NameplateOptions from './NameplateOptions'
import NameplatePreview from './NameplatePreview'

/**
 * "Faixa e moldura" (#482): a faixa atrás do nome nas listas (desligada, o
 * banner ou uma imagem própria) e a moldura por cima do avatar. Cada escolha
 * salva na hora; a prévia mostra como fica parada e animando.
 */
export default function CosmeticsModal({
  user,
  busy,
  onChoose,
  onPickDecoration,
  onRemove,
  onClose
}: {
  user: User
  busy: boolean
  onChoose: (mode: NameplateMode) => void
  onPickDecoration: () => void
  onRemove: (kind: CosmeticImageKind) => void
  onClose: () => void
}): React.JSX.Element {
  return (
    <Modal open title="Faixa e moldura" onClose={busy ? undefined : onClose} wide>
      <div className="flex flex-col gap-6">
        <NameplatePreview user={user} />
        <section className="flex flex-col gap-2">
          <SectionHeader>Faixa</SectionHeader>
          <NameplateOptions mode={user.nameplate_mode} busy={busy} onChoose={onChoose} />
          {user.nameplate_custom_url && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => onRemove('nameplate')}
              >
                Remover faixa
              </Button>
            </div>
          )}
        </section>
        <section className="flex flex-col gap-2">
          <SectionHeader>Moldura</SectionHeader>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" disabled={busy} onClick={onPickDecoration}>
              Alterar moldura
            </Button>
            {user.avatar_decoration_url && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => onRemove('decoration')}
              >
                Remover moldura
              </Button>
            )}
          </div>
        </section>
      </div>
    </Modal>
  )
}
