import type { WsEvent } from '../../../shared/api/ws'
import type { Role } from '../lib/permissions'
import { useServerStore } from './serverStore'
import { useInviteCodeStore } from './inviteCodeStore'
import { useServerLayoutStore } from './serverLayoutStore'
import { normalizeInviteCode } from '../lib/inviteLink'

/** Como o evento mudou o que a pessoa vê (quem chama decide o que fazer na tela). */
export interface ServerEventDeps {
  /** Saiu, foi expulso ou banido do servidor (reason: "leave", "kick" ou "ban"). */
  onServerRemoved: (serverId: string, reason: string) => void
  /** Cargos, cargos de membros ou sobrescritas de canal mudaram. */
  onPermissionsChanged: (serverId: string) => void
}

const REASON_VERB: Record<string, string> = {
  kick: 'expulso',
  ban: 'banido'
}

/** Texto do aviso quando a pessoa perde o servidor (sem aviso se ela mesma saiu). */
export function removedMessage(reason: string, serverName: string | undefined): string | null {
  const verb = REASON_VERB[reason]
  if (!verb) return null
  const target = serverName ? `de “${serverName}”` : 'do servidor'
  return `Você foi ${verb} ${target}.`
}

type RoleEventHandler = (payload: Record<string, unknown>, deps: ServerEventDeps, event: WsEvent) => void

function onRoleUpsert(payload: Record<string, unknown>): void {
  const serverId = payload.server_id as string | undefined
  const role = payload.role as Role | undefined
  if (serverId && role) useServerStore.getState().upsertLocalRole(serverId, role)
}

function onRoleDelete(payload: Record<string, unknown>): void {
  const serverId = payload.server_id as string | undefined
  const roleId = payload.role_id as string | undefined
  if (serverId && roleId) useServerStore.getState().removeLocalRole(serverId, roleId)
}

function onRoleReorder(payload: Record<string, unknown>): void {
  const serverId = payload.server_id as string | undefined
  const roles = payload.roles as Role[] | undefined
  if (serverId && Array.isArray(roles)) useServerStore.getState().setRoles(serverId, roles)
}

function onMemberRoles(payload: Record<string, unknown>): void {
  const serverId = payload.server_id as string | undefined
  const userId = payload.user_id as string | undefined
  const roleIds = payload.role_ids as string[] | undefined
  if (serverId && userId) useServerStore.getState().setMemberRoleIds(serverId, userId, roleIds ?? [])
}

function onMemberNickname(payload: Record<string, unknown>): void {
  const serverId = payload.server_id as string | undefined
  const userId = payload.user_id as string | undefined
  const nickname = (payload.nickname as string | null | undefined) ?? null
  if (serverId && userId) useServerStore.getState().setMemberNickname(serverId, userId, nickname)
}

function onPermissionsInvalidate(payload: Record<string, unknown>, deps: ServerEventDeps): void {
  const serverId = payload.server_id as string | undefined
  if (serverId) deps.onPermissionsChanged(serverId)
}

function onInviteCode(payload: Record<string, unknown>): void {
  const serverId = payload.server_id as string | undefined
  const code = normalizeInviteCode(String(payload.code ?? ''))
  if (serverId && code) useInviteCodeStore.getState().set(serverId, code)
}

function onServerRemoved(payload: Record<string, unknown>, deps: ServerEventDeps): void {
  const serverId = payload.server_id as string | undefined
  if (serverId) deps.onServerRemoved(serverId, (payload.reason as string | undefined) ?? '')
}

const ROLE_EVENT_HANDLERS: Record<string, RoleEventHandler> = {
  'role:create': onRoleUpsert,
  'role:update': onRoleUpsert,
  'role:delete': onRoleDelete,
  'role:reorder': onRoleReorder,
  'server:member:roles': onMemberRoles,
  'server:member:nickname': onMemberNickname,
  'server:permissions:invalidate': onPermissionsInvalidate,
  'server:invite_code': onInviteCode,
  'server:removed': onServerRemoved,
  'server:layout': (_p, _d, event) => useServerLayoutStore.getState().handleWsEvent(event)
}

/**
 * Eventos de cargos, permissões, apelidos e layout do servidor. Devolve true se o
 * evento era deste tipo (e já foi tratado).
 */
export function handleServerRoleEvent(event: WsEvent, deps: ServerEventDeps): boolean {
  const handler = ROLE_EVENT_HANDLERS[event.type]
  if (!handler) return false
  handler((event.payload ?? {}) as Record<string, unknown>, deps, event)
  return true
}
