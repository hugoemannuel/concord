import { useState } from 'react'
import Button from '../../../shared/ui/Button'
import { TrashIcon } from '../../../shared/ui/icons'
import { Skeleton } from '../../../shared/ui/skeleton/Skeleton'
import { showToast } from '../../../shared/store/toastStore'
import ConfirmModal from '../../friends/components/ConfirmModal'
import ProfileEditorBody from '../../settings/components/profile/ProfileEditorBody'
import { TileAction, TileAsideContext } from '../../settings/components/profile/tiles/Tile'
import { saveErrorMessage } from '../../settings/lib/saveProfile'
import { useServerProfileEditor } from '../hooks/useServerProfileEditor'
import { isOverridden, type ServerProfileField, type ServerProfileView } from '../lib/serverProfile'

const FIELD_LABEL: Record<ServerProfileField, string> = {
  name: 'nome e estilo',
  banner_color: 'cor do banner',
  profile_theme: 'tema do perfil',
  pronouns: 'pronomes',
  status_text: 'nota',
  bio: 'Sobre mim',
  links: 'links',
  cosmetics: 'faixa e moldura'
}

/** O que há para apagar: campos sobrescritos ou um apelido que é da pessoa. */
function hasSomethingToRemove(view: ServerProfileView): boolean {
  return view.has_profile || Boolean(view.nickname && view.can_change_nickname)
}

/**
 * Configurações → Perfis no modo servidor: os mesmos blocos e a mesma prévia do
 * perfil global, com o valor herdado até ser alterado e "Voltar ao padrão" por
 * bloco. Status, som de entrada e perfis salvos continuam só no global.
 */
export default function ServerProfileEditor({
  serverId,
  serverName
}: {
  serverId: string
  serverName: string
}): React.JSX.Element {
  const editor = useServerProfileEditor(serverId)
  const [removing, setRemoving] = useState(false)
  const { view, profile, resetField } = editor

  const aside = (field: ServerProfileField): React.ReactNode =>
    isOverridden(field, view) ? (
      <TileAction
        label={`Voltar ${FIELD_LABEL[field]} ao padrão`}
        disabled={profile.saving}
        onClick={() => resetField(field)}
      >
        Voltar ao padrão
      </TileAction>
    ) : (
      <span className="text-ds-xs text-faint">Herdado</span>
    )

  if (editor.failed) {
    return (
      <p role="alert" className="text-ds-sm text-secondary">
        Não foi possível carregar o perfil deste servidor. Tente de novo mais tarde.
      </p>
    )
  }
  if (!view || !profile.user) return <Skeleton className="h-96 w-full rounded-xl" />

  const remove = async (): Promise<void> => {
    try {
      await editor.removeProfile()
    } catch (err) {
      showToast.error(saveErrorMessage(err))
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 basis-60 text-ds-sm text-secondary">
          Este perfil só aparece em {serverName}. O que você não alterar continua igual ao perfil
          global.
        </p>
        {hasSomethingToRemove(view) && (
          <Button variant="ghost" className="min-h-10" onClick={() => setRemoving(true)}>
            <TrashIcon className="h-4 w-4" />
            Apagar perfil deste servidor
          </Button>
        )}
      </div>
      <TileAsideContext.Provider value={aside}>
        <ProfileEditorBody
          profile={profile}
          cosmetics={editor.cosmetics}
          nameLocked={!view.can_change_nickname}
          mediaControls={{
            avatar: Boolean(view.profile.avatar_url),
            banner: Boolean(view.profile.banner_url),
            onReset: editor.resetMedia
          }}
        />
      </TileAsideContext.Provider>
      <ConfirmModal
        open={removing}
        title="Apagar perfil deste servidor?"
        confirmLabel="Apagar perfil"
        onConfirm={remove}
        onClose={() => setRemoving(false)}
      >
        Em {serverName} você volta a aparecer com o perfil global. As imagens enviadas só para este
        servidor são apagadas.
      </ConfirmModal>
    </div>
  )
}
