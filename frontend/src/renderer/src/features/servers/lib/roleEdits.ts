import type { RoleInput } from '../api/roles'
import type { Role } from './permissions'

// O que o editor de cargo guarda e manda: só o que a pessoa mexeu. O resto
// acompanha o cargo (se outro moderador o mudar, quem não editou aquele campo
// já vê o valor novo).

/** Campos que a pessoa mexeu no editor (ausente = não mexeu). */
export interface RoleEdits {
  name?: string
  color?: number | null
  hoist?: boolean
  mentionable?: boolean
  permissions?: number
}

/** O cargo como aparece no editor: as edições por cima do cargo. */
export interface RoleDraft {
  name: string
  color: number | null
  hoist: boolean
  mentionable: boolean
  permissions: number
}

export function roleDraft(role: Role, edits: RoleEdits): RoleDraft {
  return {
    name: edits.name ?? role.name,
    // null é "sem cor" (uma edição); só undefined é "não mexeu".
    color: edits.color !== undefined ? edits.color : role.color,
    hoist: edits.hoist ?? role.hoist,
    mentionable: edits.mentionable ?? Boolean(role.mentionable),
    permissions: edits.permissions ?? role.permissions
  }
}

/** Só o que mudou vai para o servidor (nome sem espaços nas pontas). */
export function roleInputFor(role: Role, draft: RoleDraft): RoleInput {
  const input: RoleInput = {}
  if (draft.name !== role.name) input.name = draft.name.trim()
  if (draft.color !== role.color) Object.assign(input, colorInput(draft.color))
  if (draft.hoist !== role.hoist) input.hoist = draft.hoist
  if (draft.mentionable !== Boolean(role.mentionable)) input.mentionable = draft.mentionable
  if (draft.permissions !== role.permissions) input.permissions = draft.permissions
  return input
}

/** Tirar a cor é um campo próprio no servidor. */
function colorInput(color: number | null): RoleInput {
  return color === null ? { clear_color: true } : { color }
}

/** Há alteração a salvar? */
export function isRoleDirty(role: Role, draft: RoleDraft): boolean {
  return Object.keys(roleInputFor(role, draft)).length > 0
}
