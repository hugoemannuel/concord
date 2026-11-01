import { useState } from 'react'
import Button from '../../../shared/ui/Button'
import { PlusIcon } from '../../../shared/ui/icons'
import ConfirmModal from '../../friends/components/ConfirmModal'
import { useSavedProfiles, type SavedProfilesView } from '../hooks/useSavedProfiles'
import {
  MAX_SAVED_PROFILES,
  SAVING_NEW,
  suggestSavedName,
  type SavedProfile
} from '../lib/savedProfiles'
import SavedProfileCard from './SavedProfileCard'
import SavedProfileNameModal from './SavedProfileNameModal'
import SectionHeader from '../../../shared/ui/SectionHeader'

type NameModal = { kind: 'create' } | { kind: 'rename'; item: SavedProfile } | null

function NameModals({
  view,
  modal,
  onClose
}: {
  view: SavedProfilesView
  modal: NameModal
  onClose: () => void
}): React.JSX.Element | null {
  if (!modal) return null
  const common = { list: view.items, busy: view.busy !== null, onClose }
  return modal.kind === 'create' ? (
    <SavedProfileNameModal
      {...common}
      title="Salvar perfil atual"
      submitLabel="Salvar"
      initialName={suggestSavedName(view.items)}
      onSubmit={view.save}
    />
  ) : (
    <SavedProfileNameModal
      {...common}
      title="Renomear perfil"
      submitLabel="Renomear"
      initialName={modal.item.name}
      ownId={modal.item.id}
      onSubmit={(name) => view.rename(modal.item.id, name)}
    />
  )
}

/** Excluir, atualizar e o aviso de que o perfil de agora (não salvo) vai se perder. */
function Confirms({
  view,
  deleting,
  onCloseDelete,
  updating,
  onCloseUpdate
}: {
  view: SavedProfilesView
  deleting: SavedProfile | null
  onCloseDelete: () => void
  updating: SavedProfile | null
  onCloseUpdate: () => void
}): React.JSX.Element {
  return (
    <>
      <ConfirmModal
        open={deleting !== null}
        title={`Excluir "${deleting?.name ?? ''}"?`}
        confirmLabel="Excluir"
        onConfirm={async () => {
          if (deleting) await view.remove(deleting.id)
        }}
        onClose={onCloseDelete}
      >
        O perfil salvo some da lista. Seu perfil atual não muda.
      </ConfirmModal>
      <ConfirmModal
        open={updating !== null}
        title={`Atualizar "${updating?.name ?? ''}"?`}
        confirmLabel="Atualizar"
        danger={false}
        onConfirm={async () => {
          if (updating) await view.update(updating.id)
        }}
        onClose={onCloseUpdate}
      >
        O perfil salvo fica igual ao seu perfil atual (foto, banner e textos). O que estava
        guardado nele se perde; o nome continua o mesmo.
      </ConfirmModal>
      <ConfirmModal
        open={view.pendingApply !== null}
        title={`Usar "${view.pendingApply?.name ?? ''}"?`}
        confirmLabel="Usar perfil"
        danger={false}
        onConfirm={view.confirmApply}
        onClose={view.cancelApply}
      >
        Seu perfil atual não está salvo e vai ser substituído. Para voltar a ele depois, cancele e
        use “Salvar perfil atual” antes.
      </ConfirmModal>
    </>
  )
}

/**
 * Perfis salvos (Configurações → Perfis): guarda o perfil como está e troca
 * entre os salvos com um toque. Aplicar já salva e todo mundo vê na hora.
 */
export default function SavedProfilesPanel(): React.JSX.Element | null {
  const view = useSavedProfiles()
  const [modal, setModal] = useState<NameModal>(null)
  const [deleting, setDeleting] = useState<SavedProfile | null>(null)
  const [updating, setUpdating] = useState<SavedProfile | null>(null)
  if (!view.user) return null

  return (
    <section aria-labelledby="saved-profiles-title" className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <SectionHeader id="saved-profiles-title">
            Perfis salvos{' '}
            <span className="font-normal normal-case tracking-normal">
              ({view.items.length}/{MAX_SAVED_PROFILES})
            </span>
          </SectionHeader>
          <p className="text-ds-xs text-faint">
            Guarde o perfil como está agora e troque com um toque.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={!view.canSave || view.busy !== null}
          title={view.canSave ? undefined : 'Exclua um perfil salvo para salvar outro.'}
          onClick={() => setModal({ kind: 'create' })}
          className="flex min-h-10 items-center gap-1.5"
        >
          <PlusIcon className="size-4" />
          {view.busy === SAVING_NEW ? 'Salvando…' : 'Salvar perfil atual'}
        </Button>
      </div>

      {view.loaded && view.items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-subtle px-3 py-4 text-center text-ds-sm text-muted">
          Nenhum perfil salvo ainda.
        </p>
      ) : (
        <ul
          aria-busy={!view.loaded}
          className="grid gap-2 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4"
        >
          {view.items.map((item) => (
            <SavedProfileCard
              key={item.id}
              item={item}
              current={item.id === view.currentId}
              busy={view.busy !== null}
              onApply={() => view.choose(item)}
              onRename={() => setModal({ kind: 'rename', item })}
              onUpdate={() => setUpdating(item)}
              onDelete={() => setDeleting(item)}
            />
          ))}
        </ul>
      )}

      <NameModals view={view} modal={modal} onClose={() => setModal(null)} />
      <Confirms
        view={view}
        deleting={deleting}
        onCloseDelete={() => setDeleting(null)}
        updating={updating}
        onCloseUpdate={() => setUpdating(null)}
      />
    </section>
  )
}
