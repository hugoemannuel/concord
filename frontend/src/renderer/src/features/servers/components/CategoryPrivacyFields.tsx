import { useState } from 'react'
import type { CategoryPrivacy } from '../api/categories'
import type { ServerMember } from '../api/servers'
import { useServerStore } from '../store/serverStore'
import { serverDisplayName } from '../lib/serverNames'
import { toggleRole } from '../lib/channelForm'
import { LockIcon } from '../../../shared/ui/icons'
import CloseButton from '../../../shared/ui/CloseButton'
import Input from '../../../shared/ui/Input'
import Switch from '../../../shared/ui/Switch'

const MAX_MATCHES = 6

function matches(member: ServerMember, term: string): boolean {
  return [member.nickname, member.display_name, member.username].some((value) => value?.toLowerCase().includes(term))
}

/** Membros escolhidos, com busca para acrescentar mais. */
function MemberPicker({ memberIds, onChange }: { memberIds: string[]; onChange: (ids: string[]) => void }): React.JSX.Element {
  const members = useServerStore((s) => s.currentMembers)
  const [term, setTerm] = useState('')
  const search = term.trim().toLowerCase()
  const found = search ? members.filter((m) => !memberIds.includes(m.user_id) && matches(m, search)).slice(0, MAX_MATCHES) : []
  const chosen = memberIds.map((id) => ({ id, member: members.find((m) => m.user_id === id) }))
  return (
    <div>
      <p className="mb-1 text-ds-sm font-medium text-muted">Membros</p>
      <Input aria-label="Buscar membro" placeholder="Buscar membro" value={term} onChange={(event) => setTerm(event.target.value)} />
      {found.length > 0 && (
        <ul className="mt-1 flex max-h-32 flex-col gap-0.5 overflow-y-auto">
          {found.map((member) => (
            <li key={member.user_id}>
              <button type="button" className="focus-ring min-h-10 w-full cursor-pointer truncate rounded px-2 py-1 text-left text-ds-md text-normal hover:bg-fg/5 sm:min-h-0"
                onClick={() => { onChange([...memberIds, member.user_id]); setTerm('') }}>
                {serverDisplayName(member, member)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {chosen.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {chosen.map(({ id, member }) => {
            const name = member ? serverDisplayName(member, member) : 'Membro'
            return (
              <li key={id} className="flex items-center justify-between gap-2 rounded bg-fg/5 px-2 py-1 text-ds-sm text-normal">
                <span className="truncate">{name}</span>
                <CloseButton label={`Tirar ${name}`} onClick={() => onChange(memberIds.filter((item) => item !== id))} />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function RolePicker({ roleIds, onChange }: { roleIds: string[]; onChange: (ids: string[]) => void }): React.JSX.Element {
  const roles = useServerStore((s) => s.roles).filter((role) => !role.is_default)
  return (
    <div>
      <p className="mb-1 text-ds-sm font-medium text-muted">Cargos</p>
      {roles.length === 0 ? (
        <p className="text-ds-sm text-faint">Nenhum cargo ainda. Crie cargos em Configurações do servidor.</p>
      ) : (
        <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
          {roles.map((role) => (
            <li key={role.id}>
              <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded px-2 py-1 text-ds-md text-normal hover:bg-fg/5 sm:min-h-0">
                <input type="checkbox" checked={roleIds.includes(role.id)} onChange={(event) => onChange(toggleRole(roleIds, role.id, event.target.checked))} />
                <span className="truncate">{role.name}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** A opção "Categoria privada" e a escolha de quem pode ver. */
export function CategoryPrivacyFields({ value, onChange }: { value: CategoryPrivacy; onChange: (value: CategoryPrivacy) => void }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-subtle bg-fg/3 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-ds-md font-medium text-strong">
            <LockIcon className="h-3.5 w-3.5 shrink-0 text-faint" />
            Categoria privada
          </p>
          <p className="text-ds-sm text-muted">
            Só os cargos e membros escolhidos veem esta categoria. Os canais vinculados, de texto e de voz, acompanham.
          </p>
        </div>
        <Switch checked={value.private} label="Categoria privada" onChange={(on) => onChange({ ...value, private: on })} />
      </div>
      {value.private && (
        <div className="mt-3 flex flex-col gap-3 border-t border-subtle pt-3">
          <RolePicker roleIds={value.role_ids} onChange={(role_ids) => onChange({ ...value, role_ids })} />
          <MemberPicker memberIds={value.member_ids} onChange={(member_ids) => onChange({ ...value, member_ids })} />
        </div>
      )}
    </div>
  )
}
