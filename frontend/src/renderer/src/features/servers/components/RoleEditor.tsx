import { useState } from 'react'
import { useServerStore } from '../store/serverStore'
import { useServerAccess } from '../hooks/useServerAccess'
import { useRoleEdits } from '../hooks/useRoleEdits'
import { showToast } from '../../../shared/store/toastStore'
import { actionErrorMessage } from '../lib/permissionErrors'
import { canGrant, type Role } from '../lib/permissions'
import Button from '../../../shared/ui/Button'
import ConfirmModal from '../../friends/components/ConfirmModal'
import PermissionSwitches from './PermissionSwitches'
import RoleDisplayTab from './RoleDisplayTab'
import RoleMembers from './RoleMembers'

type Tab = 'display' | 'permissions' | 'members'

const EVERYONE_TABS: { id: Tab; label: string }[] = [{ id: 'permissions', label: 'Permissões' }]
const ROLE_TABS: { id: Tab; label: string }[] = [
  { id: 'display', label: 'Exibição' },
  { id: 'permissions', label: 'Permissões' },
  { id: 'members', label: 'Membros' }
]

/** Título, botão de apagar e os avisos de cargo acima do seu e de cargo fixo. */
function RoleEditorHeader({
  role,
  manageable,
  onDelete
}: {
  role: Role
  manageable: boolean
  onDelete: () => void
}): React.JSX.Element {
  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="min-w-0 truncate text-base font-bold text-strong">
          {role.is_default ? 'Permissões padrão (@everyone)' : `Editar cargo — ${role.name}`}
        </h2>
        {!role.is_default && !role.is_system && manageable && (
          <Button
            variant="danger"
            className="px-3 py-1 text-xs"
            onClick={onDelete}
          >
            Apagar
          </Button>
        )}
      </div>

      {!manageable && (
        <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Este cargo está acima do seu: você pode ver, mas não editar.
        </p>
      )}

      {role.is_system && (
        <p className="mb-4 rounded-lg border border-subtle bg-fg/5 px-3 py-2 text-xs text-gray-300">
          O cargo <b className="text-strong">{role.name}</b> é fixo do servidor e exclusivo para
          bots: fica sempre abaixo dos demais cargos e não pode ser apagado nem atribuído a outros
          usuários.
        </p>
      )}
    </>
  )
}

/** As abas do editor (o @everyone só tem permissões). */
function RoleTabs({
  tabs,
  activeTab,
  setTab
}: {
  tabs: { id: Tab; label: string }[]
  activeTab: Tab
  setTab: (tab: Tab) => void
}): React.JSX.Element {
  return (
    <div className="mb-5 flex gap-1 border-b border-subtle">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setTab(t.id)}
          aria-current={activeTab === t.id ? 'page' : undefined}
          className={`-mb-px cursor-pointer border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
            activeTab === t.id
              ? 'border-brand text-strong'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

/** Barra de alterações não salvas, presa ao fim do editor. */
function UnsavedBar({
  saving,
  canSave,
  save,
  reset
}: {
  saving: boolean
  canSave: boolean
  save: () => Promise<void>
  reset: () => void
}): React.JSX.Element {
  return (
    <div className="sticky bottom-4 mt-6 flex items-center justify-between gap-3 rounded-xl border border-subtle bg-floating px-4 py-3 shadow-2xl backdrop-blur-xl">
      <p className="text-sm text-gray-300">Cuidado: você tem alterações não salvas.</p>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={reset} disabled={saving}>
          Redefinir
        </Button>
        <Button variant="success" onClick={() => void save()} disabled={saving || !canSave}>
          {saving ? 'Salvando...' : 'Salvar alterações'}
        </Button>
      </div>
    </div>
  )
}

/** Editor de um cargo: exibição, permissões e membros. */
export default function RoleEditor({
  serverId,
  role
}: {
  serverId: string
  role: Role
}): React.JSX.Element {
  const deleteRole = useServerStore((s) => s.deleteRole)
  const access = useServerAccess()
  const [tab, setTab] = useState<Tab>('display')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { draft, dirty, saving, change, save, reset } = useRoleEdits(serverId, role)

  const manageable = access.canManage(role)
  const activeTab = role.is_default ? 'permissions' : tab

  return (
    <div>
      <RoleEditorHeader
        role={role}
        manageable={manageable}
        onDelete={() => setConfirmDelete(true)}
      />
      <RoleTabs
        tabs={role.is_default ? EVERYONE_TABS : ROLE_TABS}
        activeTab={activeTab}
        setTab={setTab}
      />

      <fieldset disabled={!manageable} className="min-w-0 border-0 p-0">
        {activeTab === 'display' && <RoleDisplayTab role={role} draft={draft} onChange={change} />}

        {activeTab === 'permissions' && (
          <PermissionSwitches
            value={draft.permissions}
            onChange={(value) => change('permissions', value)}
            canToggle={(bit) => manageable && canGrant(access.perms, bit)}
          />
        )}
      </fieldset>

      {activeTab === 'members' && (
        <RoleMembers serverId={serverId} role={role} manageable={manageable} />
      )}

      {dirty && manageable && (
        <UnsavedBar
          saving={saving}
          canSave={draft.name.trim() !== ''}
          save={save}
          reset={reset}
        />
      )}

      <ConfirmModal
        open={confirmDelete}
        title={`Apagar cargo ${role.name}`}
        confirmLabel="Apagar cargo"
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          try {
            await deleteRole(serverId, role.id)
            showToast.success('Cargo apagado.')
          } catch (err) {
            showToast.error(actionErrorMessage(err, 'Não foi possível apagar o cargo.'))
          }
        }}
      >
        <p>
          Quem tem o cargo <b className="text-strong">{role.name}</b> perde as permissões dele, e as
          regras dos canais que usavam este cargo são removidas.
        </p>
      </ConfirmModal>
    </div>
  )
}
