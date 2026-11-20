import { useMemo, useState } from 'react'
import { useServerStore } from '../store/serverStore'
import { useServerAccess } from '../hooks/useServerAccess'
import { showToast } from '../../../shared/store/toastStore'
import { actionErrorMessage } from '../lib/permissionErrors'
import { canGrant, parseColorCss, roleColorCss, type Role } from '../lib/permissions'
import { moveRoleId } from '../lib/roleList'
import Button from '../../../shared/ui/Button'
import Input from '../../../shared/ui/Input'
import Switch from '../../../shared/ui/Switch'
import ConfirmModal from '../../friends/components/ConfirmModal'
import { ChevronDownIcon, ChevronUpIcon, PlusIcon } from '../../../shared/ui/icons'
import PermissionSwitches from './PermissionSwitches'
import RoleMembers from './RoleMembers'

type Tab = 'display' | 'permissions' | 'members'

interface RoleEdits {
  name?: string
  color?: number | null
  hoist?: boolean
  mentionable?: boolean
  permissions?: number
}

const SWATCHES = [
  0x1abc9c, 0x2ecc71, 0x3498db, 0x9b59b6, 0xe91e63, 0xf1c40f, 0xe67e22, 0xe74c3c, 0x95a5a6, 0x607d8b
]

/** Cargos: lista com hierarquia à esquerda e editor (exibição, permissões, membros) à direita. */
function RolesSection(): React.JSX.Element {
  const serverId = useServerStore((s) => s.currentServer?.id)
  const roles = useServerStore((s) => s.roles)
  const members = useServerStore((s) => s.currentMembers)
  const createRole = useServerStore((s) => s.createRole)
  const reorderRoles = useServerStore((s) => s.reorderRoles)
  const access = useServerAccess()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const selected = roles.find((r) => r.id === selectedId) ?? roles[0]
  const orderable = roles.filter((r) => !r.is_default && !r.is_system)
  const counts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const m of members) for (const id of m.role_ids ?? []) map[id] = (map[id] ?? 0) + 1
    return map
  }, [members])

  if (!serverId) return <p className="text-sm text-gray-400">Abra um servidor primeiro.</p>

  const create = async (): Promise<void> => {
    setBusy(true)
    try {
      const role = await createRole(serverId, { name: 'novo cargo' })
      setSelectedId(role.id)
    } catch (err) {
      showToast.error(actionErrorMessage(err, 'Não foi possível criar o cargo.'))
    } finally {
      setBusy(false)
    }
  }

  const move = async (role: Role, direction: -1 | 1): Promise<void> => {
    const ids = orderable.map((r) => r.id)
    const neighbor = ids[ids.indexOf(role.id) + direction]
    if (!neighbor) return
    try {
      await reorderRoles(serverId, moveRoleId(ids, role.id, neighbor))
    } catch (err) {
      showToast.error(actionErrorMessage(err, 'Não foi possível mudar a ordem.'))
    }
  }

  const canMove = (role: Role, direction: -1 | 1): boolean => {
    if (role.is_default || role.is_system || !access.canManage(role)) return false
    const index = orderable.findIndex((r) => r.id === role.id)
    const neighbor = orderable[index + direction]
    return !!neighbor && access.canManage(neighbor)
  }

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <div className="w-full md:w-[230px] md:shrink-0">
        <Button
          variant="primary"
          className="mb-3 flex w-full items-center justify-center gap-1.5 py-1.5 text-xs"
          onClick={() => void create()}
          disabled={busy}
        >
          <PlusIcon className="h-4 w-4" />
          Criar cargo
        </Button>
        <p className="mb-2 text-xs leading-snug text-gray-500">
          Quem está mais acima na lista manda nos de baixo. Você só mexe nos cargos abaixo do seu
          mais alto.
        </p>
        <ul className="flex flex-col gap-0.5">
          {roles.map((role) => (
            <li key={role.id} className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSelectedId(role.id)}
                aria-current={selected?.id === role.id ? 'true' : undefined}
                className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium transition-colors ${
                  selected?.id === role.id
                    ? 'bg-fg/10 text-strong'
                    : 'text-gray-400 hover:bg-fg/5 hover:text-gray-200'
                }`}
              >
                <span
                  aria-hidden
                  className="h-3 w-3 shrink-0 rounded-full border border-normal"
                  style={{ background: roleColorCss(role.color) ?? 'transparent' }}
                />
                <span className="min-w-0 flex-1 truncate">{role.name}</span>
                {!role.is_default && (
                  <span className="shrink-0 text-ds-xs text-gray-500">{counts[role.id] ?? 0}</span>
                )}
              </button>
              {!role.is_default && !role.is_system && (
                <span className="flex shrink-0 flex-col transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-within:opacity-100">
                  <button
                    type="button"
                    aria-label={`Subir ${role.name}`}
                    disabled={!canMove(role, -1)}
                    onClick={() => void move(role, -1)}
                    className="cursor-pointer rounded text-gray-400 hover:text-strong disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronUpIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Descer ${role.name}`}
                    disabled={!canMove(role, 1)}
                    onClick={() => void move(role, 1)}
                    className="cursor-pointer rounded text-gray-400 hover:text-strong disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronDownIcon className="h-3.5 w-3.5" />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="min-w-0 flex-1">
        {selected ? (
          <RoleEditor key={selected.id} serverId={serverId} role={selected} />
        ) : (
          <p className="text-sm text-gray-400">Nenhum cargo ainda.</p>
        )}
      </div>
    </div>
  )
}

function RoleEditor({ serverId, role }: { serverId: string; role: Role }): React.JSX.Element {
  const updateRole = useServerStore((s) => s.updateRole)
  const deleteRole = useServerStore((s) => s.deleteRole)
  const access = useServerAccess()
  const [tab, setTab] = useState<Tab>('display')
  // Só o que a pessoa mexeu; o resto acompanha o cargo (se outro moderador o
  // mudar, quem não editou aquele campo já vê o novo valor).
  const [edits, setEdits] = useState<RoleEdits>({})
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const name = edits.name ?? role.name
  const color = edits.color !== undefined ? edits.color : role.color
  const hoist = edits.hoist ?? role.hoist
  const mentionable = edits.mentionable ?? Boolean(role.mentionable)
  const permissions = edits.permissions ?? role.permissions
  const setName = (value: string): void => setEdits((e) => ({ ...e, name: value }))
  const setColor = (value: number | null): void => setEdits((e) => ({ ...e, color: value }))
  const setHoist = (value: boolean): void => setEdits((e) => ({ ...e, hoist: value }))
  const setMentionable = (value: boolean): void =>
    setEdits((e) => ({ ...e, mentionable: value }))
  const setPermissions = (value: number): void => setEdits((e) => ({ ...e, permissions: value }))

  const manageable = access.canManage(role)
  const dirty =
    name !== role.name ||
    color !== role.color ||
    hoist !== role.hoist ||
    mentionable !== Boolean(role.mentionable) ||
    permissions !== role.permissions
  const tabs: { id: Tab; label: string }[] = role.is_default
    ? [{ id: 'permissions', label: 'Permissões' }]
    : [
        { id: 'display', label: 'Exibição' },
        { id: 'permissions', label: 'Permissões' },
        { id: 'members', label: 'Membros' }
      ]
  const activeTab = role.is_default ? 'permissions' : tab

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await updateRole(serverId, role.id, {
        ...(name !== role.name ? { name: name.trim() } : {}),
        ...(color !== role.color ? (color === null ? { clear_color: true } : { color }) : {}),
        ...(hoist !== role.hoist ? { hoist } : {}),
        ...(mentionable !== Boolean(role.mentionable) ? { mentionable } : {}),
        ...(permissions !== role.permissions ? { permissions } : {})
      })
      setEdits({})
      showToast.success('Cargo salvo!')
    } catch (err) {
      showToast.error(actionErrorMessage(err, 'Não foi possível salvar o cargo.'))
    } finally {
      setSaving(false)
    }
  }

  const reset = (): void => setEdits({})

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="min-w-0 truncate text-base font-bold text-strong">
          {role.is_default ? 'Permissões padrão (@everyone)' : `Editar cargo — ${role.name}`}
        </h2>
        {!role.is_default && !role.is_system && manageable && (
          <Button
            variant="danger"
            className="px-3 py-1 text-xs"
            onClick={() => setConfirmDelete(true)}
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

      <fieldset disabled={!manageable} className="min-w-0 border-0 p-0">
        {activeTab === 'display' && (
          <div className="space-y-6">
            <Input
              label="Nome do cargo"
              value={name}
              maxLength={32}
              disabled={!!role.is_system}
              onChange={(e) => setName(e.target.value)}
            />

            <div>
              <p className="mb-2 text-sm font-medium text-gray-300">Cor do cargo</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setColor(null)}
                  aria-label="Sem cor"
                  title="Sem cor"
                  className={`h-7 w-7 cursor-pointer rounded-full border text-xs text-gray-400 ${
                    color === null ? 'border-[var(--text-strong)]' : 'border-normal'
                  }`}
                >
                  ∅
                </button>
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Cor ${roleColorCss(c)}`}
                    className={`h-7 w-7 cursor-pointer rounded-full border-2 ${
                      color === c ? 'border-[var(--text-strong)]' : 'border-transparent'
                    }`}
                    style={{ background: roleColorCss(c) }}
                  />
                ))}
                <input
                  type="color"
                  aria-label="Escolher outra cor"
                  value={roleColorCss(color) ?? '#99aab5'}
                  onChange={(e) => setColor(parseColorCss(e.target.value))}
                  className="h-7 w-9 cursor-pointer rounded border border-normal bg-transparent p-0"
                />
              </div>
              <p className="mt-2 text-xs text-gray-500">
                O nome de quem tem o cargo aparece com essa cor (vale a do cargo mais alto que tem
                cor).
              </p>
            </div>

            {!role.is_system && (
              <div className="flex items-center justify-between gap-4 rounded-lg border border-subtle bg-fg/3 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-strong">Exibir membros separadamente</p>
                  <p className="text-xs text-gray-400">
                    Quem está online com este cargo ganha um grupo próprio na lista de membros.
                  </p>
                </div>
                <Switch checked={hoist} label="Exibir membros separadamente" onChange={setHoist} />
              </div>
            )}

            {!role.is_system && (
              <div className="flex items-center justify-between gap-4 rounded-lg border border-subtle bg-fg/3 px-4 py-3">
                <p className="text-ds-sm font-semibold text-strong">
                  Permitir que qualquer pessoa mencione este cargo
                </p>
                <Switch
                  checked={mentionable}
                  label="Permitir que qualquer pessoa mencione este cargo"
                  onChange={setMentionable}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'permissions' && (
          <PermissionSwitches
            value={permissions}
            onChange={setPermissions}
            canToggle={(bit) => manageable && canGrant(access.perms, bit)}
          />
        )}
      </fieldset>

      {activeTab === 'members' && (
        <RoleMembers serverId={serverId} role={role} manageable={manageable} />
      )}

      {dirty && manageable && (
        <div className="sticky bottom-4 mt-6 flex items-center justify-between gap-3 rounded-xl border border-subtle bg-floating px-4 py-3 shadow-2xl backdrop-blur-xl">
          <p className="text-sm text-gray-300">Cuidado: você tem alterações não salvas.</p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={reset} disabled={saving}>
              Redefinir
            </Button>
            <Button variant="success" onClick={() => void save()} disabled={saving || !name.trim()}>
              {saving ? 'Salvando...' : 'Salvar alterações'}
            </Button>
          </div>
        </div>
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

export default RolesSection
