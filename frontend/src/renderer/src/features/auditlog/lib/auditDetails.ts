import type { AuditChange, AuditEntry } from '../api/auditLog'
import { PERMISSION_GROUPS } from '../../servers/lib/permissionCatalog'
import { Perm } from '../../servers/lib/permissions'
import { actionInfo } from './auditActions'

/** Um campo que mudou: antes e depois já em texto. */
export interface ValueRow {
  label: string
  before?: string
  after?: string
}

/** Permissões: o que entrou e o que saiu (pelos rótulos da tela de cargos). */
export interface PermissionRow {
  label: string
  added: string[]
  removed: string[]
}

export type DetailRow = ValueRow | PermissionRow

const EMPTY = '—'
const yesNo = (v: unknown): string => (v ? 'Sim' : 'Não')
const text = (v: unknown): string => (v === undefined || v === null || v === '' ? EMPTY : String(v))

const CHANNEL_TYPE: Record<string, string> = { text: 'Texto', voice: 'Voz' }
const RECURRENCE: Record<string, string> = {
  none: 'Não repete',
  daily: 'Todo dia',
  weekly: 'Toda semana',
  monthly: 'Todo mês'
}
const LINK_DURATION: Record<string, string> = { '2h': '2 horas', '6h': '6 horas', '12h': '12 horas', '24h': '1 dia' }
const EVENT_ACTIONS: [number, string][] = [
  [1, 'Criar'],
  [2, 'Editar'],
  [4, 'Excluir'],
  [8, 'Configurar']
]

function color(v: unknown): string {
  if (typeof v !== 'number') return 'sem cor'
  return `#${v.toString(16).padStart(6, '0').toUpperCase()}`
}

function minutes(v: unknown): string {
  const total = Number(v)
  if (!total) return EMPTY
  const h = Math.floor(total / 60)
  const m = total % 60
  if (!h) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
}

function dateTime(v: unknown): string {
  if (!v) return EMPTY
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(String(v)))
}

function eventActions(v: unknown): string {
  const bits = Number(v)
  const names = EVENT_ACTIONS.filter(([bit]) => (bits & bit) !== 0).map(([, name]) => name)
  return names.length ? names.join(', ') : 'Nenhuma'
}

const lookup = (table: Record<string, string>) => (v: unknown) => table[String(v)] ?? text(v)

/** Rótulo e formato de cada campo que o backend grava (backend/internal/<domínio>/audit.go). */
const FIELDS: Record<string, { label: string; format: (v: unknown) => string }> = {
  name: { label: 'Nome', format: text },
  title: { label: 'Título', format: text },
  description: { label: 'Descrição', format: text },
  icon: { label: 'Ícone', format: (v) => (v ? 'imagem' : 'sem ícone') },
  type: { label: 'Tipo', format: lookup(CHANNEL_TYPE) },
  private: { label: 'Privado', format: yesNo },
  color: { label: 'Cor', format: color },
  hoist: { label: 'Mostrar separado', format: yesNo },
  nick: { label: 'Apelido', format: (v) => (v ? String(v) : 'sem apelido') },
  channel: { label: 'Canal', format: text },
  starts_at: { label: 'Início', format: dateTime },
  duration_minutes: { label: 'Duração', format: minutes },
  recurrence: { label: 'Repetição', format: (v) => (v ? lookup(RECURRENCE)(v) : EMPTY) },
  duration: { label: 'Duração do link', format: lookup(LINK_DURATION) },
  can_speak: { label: 'Pode falar', format: yesNo },
  can_stream: { label: 'Câmera e tela', format: yesNo },
  event_actions: { label: 'Ações nos eventos', format: eventActions }
}

const PERMISSION_FIELDS: Record<string, string> = { permissions: 'Permissões', allow: 'Permitido', deny: 'Negado' }

/** Campos que a frase já conta (não repetem nos detalhes). */
const IN_SENTENCE = new Set(['role', 'mute', 'deaf'])

const PERMISSION_LABELS: [number, string][] = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p): [number, string] => [Perm[p.name], p.label])
)

function permissionLabels(bits: number): string[] {
  return PERMISSION_LABELS.filter(([bit]) => (bits & bit) !== 0).map(([, label]) => label)
}

function permissionRow(label: string, c: AuditChange): PermissionRow {
  const before = Number(c.before ?? 0)
  const after = Number(c.after ?? 0)
  return { label, added: permissionLabels(after & ~before), removed: permissionLabels(before & ~after) }
}

/**
 * Na criação só há o "depois". Nas outras, o "antes" ausente é o vazio (o
 * backend não manda valor nulo: sem cor, sem apelido).
 */
function valueRow(e: AuditEntry, label: string, format: (v: unknown) => string, c: AuditChange): ValueRow {
  const row: ValueRow = { label }
  if (actionInfo(e.action).tone !== 'create') row.before = format(c.before)
  row.after = format(c.after)
  return row
}

function changeRow(e: AuditEntry, c: AuditChange): DetailRow {
  if (PERMISSION_FIELDS[c.field]) return permissionRow(PERMISSION_FIELDS[c.field], c)
  if (c.field === 'primary_channel') return { label: 'Canal principal', after: text(e.channel_name) }
  const field = FIELDS[c.field] ?? { label: c.field, format: text }
  return valueRow(e, field.label, field.format, c)
}

/** O que mudou, pronto para a lista de detalhes (vazio = o item não abre). */
export function describeChanges(e: AuditEntry): DetailRow[] {
  const rows = e.changes.filter((c) => !IN_SENTENCE.has(c.field)).map((c) => changeRow(e, c))
  return e.reason ? [...rows, { label: 'Motivo', after: e.reason }] : rows
}

export const isPermissionRow = (row: DetailRow): row is PermissionRow => 'added' in row
