import { request } from '../../../shared/api/client'

// Relatório de erros do app (backend: internal/apperrors, docs/adr/0068;
// contrato em docs/superpowers/plans/2026-11-25-relatorio-de-erros.md).

export type ErrorTarget = 'desktop' | 'web' | 'android'
/** Origem do erro; `backend` só nasce no servidor (o cliente não manda). */
export type ErrorSource = 'renderer' | 'main' | 'mobile' | 'backend'

export interface ErrorReportContext {
  os: string
  app_version: string
  target: ErrorTarget
}

/** Um erro do envio, já limpo e somado (count de 1 a 10 000). */
export interface ErrorReport {
  source: Exclude<ErrorSource, 'backend'>
  kind: string
  message: string
  stack: string
  screen: string
  in_call: boolean
  in_live: boolean
  count: number
}

/** POST /api/obs/errors (login de conta; visitante recebe 401). */
export function postErrors(context: ErrorReportContext, errors: ErrorReport[]): Promise<void> {
  return request<void>('/obs/errors', {
    method: 'POST',
    body: JSON.stringify({ context, errors })
  })
}

// Leitura do painel (só devs).

export interface ErrorGroup {
  fingerprint: string
  source: ErrorSource
  kind: string
  message: string
  first_seen: string
  last_seen: string
  count: number
  users: number
  versions: string[]
  systems: string[]
  targets: ErrorTarget[]
  /** Todas as ocorrências (na retenção inteira) são da versão mais nova daquela origem. */
  new_in_version: boolean
}

export interface ErrorGroupsReport {
  from: string
  to: string
  /** Versões vistas na janela, da mais nova. */
  versions: string[]
  /** Ordem: users desc, depois last_seen desc; até 200. */
  groups: ErrorGroup[]
}

export interface ErrorOccurrence {
  at: string
  username: string
  app_version: string
  os: string
  target: ErrorTarget
  screen: string
  in_call: boolean
  in_live: boolean
  count: number
}

export interface ErrorGroupDetail {
  group: ErrorGroup
  /** Pilha guardada (limpa). */
  stack: string
  /** Pilha traduzida pelos source maps, ou "" quando não deu. */
  translated: string
  screens: { screen: string; count: number }[]
  /** As 30 ocorrências mais novas. */
  recent: ErrorOccurrence[]
}

function query(params: Record<string, string | number>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value !== '') search.set(key, String(value))
  return search.toString()
}

/** GET /api/obs/errors: grupos da janela (days de 1 a 14), filtro de origem e versão opcional. */
export function getErrorGroups(days: number, source: ErrorSource | '' = '', version = ''): Promise<ErrorGroupsReport> {
  return request<ErrorGroupsReport>(`/obs/errors?${query({ days, source, version })}`)
}

/** GET /api/obs/errors/:fingerprint (404 se o grupo não existe). */
export function getErrorGroup(fingerprint: string, days: number): Promise<ErrorGroupDetail> {
  return request<ErrorGroupDetail>(`/obs/errors/${encodeURIComponent(fingerprint)}?${query({ days })}`)
}
