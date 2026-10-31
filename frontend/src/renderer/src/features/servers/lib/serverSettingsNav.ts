import { Perm } from './permissions'

// Seções das configurações do servidor (tela cheia, como as de usuário). Cada
// uma aparece para quem tem ao menos uma das permissões que ela usa.

export type ServerSettingsSectionId =
  | 'overview'
  | 'roles'
  | 'members'
  | 'bans'
  | 'audit'
  | 'events'
  | 'level'

export interface ServerSettingsSection {
  id: ServerSettingsSectionId
  label: string
  /** Aparece para quem tem qualquer uma dessas permissões. */
  anyOf: number
  /**
   * A configuração dos eventos: só o dono e os cargos a que ele deu "Configurar eventos"
   * (nem o Administrador, só por ser Administrador).
   */
  eventsConfig?: boolean
}

const MEMBER_PERMS = Perm.MANAGE_ROLES | Perm.KICK_MEMBERS | Perm.BAN_MEMBERS | Perm.MANAGE_NICKNAMES

export const SERVER_SETTINGS_SECTIONS: ServerSettingsSection[] = [
  { id: 'overview', label: 'Visão geral', anyOf: Perm.MANAGE_SERVER },
  { id: 'roles', label: 'Cargos', anyOf: Perm.MANAGE_ROLES },
  { id: 'members', label: 'Membros', anyOf: MEMBER_PERMS },
  { id: 'bans', label: 'Banimentos', anyOf: Perm.BAN_MEMBERS },
  { id: 'audit', label: 'Registro de auditoria', anyOf: Perm.VIEW_AUDIT_LOG },
  // O dono escolhe quais cargos criam, editam e excluem eventos (vale para todos os eventos).
  { id: 'events', label: 'Eventos', anyOf: 0, eventsConfig: true },
  // Só leitura, por último (não vira a seção padrão): aparece para quem abre
  // qualquer outra; os membros veem o mesmo detalhamento pelo menu do servidor.
  { id: 'level', label: 'Nível', anyOf: Perm.MANAGE_SERVER | MEMBER_PERMS }
]

/**
 * As seções que essas permissões deixam abrir. A de Eventos é do dono e de quem
 * recebeu "Configurar eventos" (canConfigureEvents).
 */
export function visibleServerSections(
  perms: number,
  isOwner = false,
  canConfigureEvents = false
): ServerSettingsSection[] {
  return SERVER_SETTINGS_SECTIONS.filter((s) =>
    s.eventsConfig ? isOwner || canConfigureEvents : (perms & s.anyOf) !== 0
  )
}

/** A seção pedida se ela é visível; senão a primeira que for (ou null). */
export function resolveServerSection(
  perms: number,
  wanted: ServerSettingsSectionId,
  isOwner = false,
  canConfigureEvents = false
): ServerSettingsSectionId | null {
  const visible = visibleServerSections(perms, isOwner, canConfigureEvents)
  if (visible.some((s) => s.id === wanted)) return wanted
  return visible[0]?.id ?? null
}

/** Alguma configuração do servidor está ao alcance (mostra o item no menu). */
export function canOpenServerSettings(perms: number, isOwner = false, canConfigureEvents = false): boolean {
  return visibleServerSections(perms, isOwner, canConfigureEvents).length > 0
}

/** O nome da seção aberta (título da tela); vazio se não há nenhuma. */
export function serverSectionLabel(
  sections: ServerSettingsSection[],
  id: ServerSettingsSectionId | null
): string {
  return sections.find((s) => s.id === id)?.label ?? ''
}
