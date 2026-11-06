import type { CallStateResponse } from '../api/calls'

// Selo "Chegou": quem entra num canal de voz enquanto eu estou olhando ganha um
// selo verde por poucos segundos. Puro: o store passa a hora e as listas.
//
// O que NÃO conta como chegada: a primeira lista que recebo (abrir o servidor,
// trocar de servidor), a primeira depois de o WebSocket cair, uma lista velha
// demais (aba parada, computador dormiu), quem já estava lá, quem saiu e voltou
// ao mesmo canal há pouco (rede ou outro dispositivo) e eu mesmo.

/** Quanto tempo o selo fica. */
export const ARRIVAL_BADGE_MS = 5000
/** Sair e voltar ao mesmo canal nesse tempo é reconexão, não chegada. */
export const REJOIN_IGNORE_MS = 15000
/** Lista mais velha que isso não serve de base. */
export const STALE_SNAPSHOT_MS = 30000

/** canal de voz -> user_ids presentes. */
export type VoiceMembers = Record<string, string[]>
/** canal -> usuário -> valor (hora do fim do selo, ou hora da saída). */
export type ByChannelUser = Record<string, Record<string, number>>

export interface ArrivalState {
  /** Selos ativos: canal -> usuário -> quando vencem. */
  arrivals: ByChannelUser
  /** Saídas recentes: canal -> usuário -> quando saiu. */
  departures: ByChannelUser
  /** Última lista vista (null = a próxima é só base). */
  snapshot: { serverId: string; at: number; members: VoiceMembers } | null
}

export const EMPTY_ARRIVALS: ArrivalState = { arrivals: {}, departures: {}, snapshot: null }

export function voiceMembers(serverCalls: Record<string, CallStateResponse>): VoiceMembers {
  const members: VoiceMembers = {}
  for (const [channelId, entry] of Object.entries(serverCalls)) {
    members[channelId] = entry.participants.map((p) => p.user_id)
  }
  return members
}

export function isArrivalActive(
  arrivals: ByChannelUser,
  channelId: string,
  userId: string,
  now: number
): boolean {
  return (arrivals[channelId]?.[userId] ?? 0) > now
}

function put(map: ByChannelUser, channelId: string, userId: string, value: number): ByChannelUser {
  return { ...map, [channelId]: { ...map[channelId], [userId]: value } }
}

function drop(map: ByChannelUser, channelId: string, userId: string): ByChannelUser {
  if (!(userId in (map[channelId] ?? {}))) return map
  const { [userId]: _gone, ...rest } = map[channelId]
  const next = { ...map, [channelId]: rest }
  if (Object.keys(rest).length === 0) delete next[channelId]
  return next
}

/** Saiu desse canal há pouco: voltar agora é reconexão. */
function leftRecently(s: ArrivalState, channelId: string, userId: string, now: number): boolean {
  const at = s.departures[channelId]?.[userId]
  return at !== undefined && now - at < REJOIN_IGNORE_MS
}

function addArrival(
  s: ArrivalState,
  channelId: string,
  userId: string,
  meId: string | undefined,
  now: number
): ArrivalState {
  if (userId === meId || leftRecently(s, channelId, userId, now)) return s
  if (isArrivalActive(s.arrivals, channelId, userId, now)) return s
  return { ...s, arrivals: put(s.arrivals, channelId, userId, now + ARRIVAL_BADGE_MS) }
}

/** Alguém entrou na minha call (call:joined). */
export function recordJoin(
  s: ArrivalState,
  channelId: string,
  userId: string,
  meId: string | undefined,
  now: number
): ArrivalState {
  return addArrival(s, channelId, userId, meId, now)
}

function trimDepartures(departures: ByChannelUser, now: number): ByChannelUser {
  const kept: ByChannelUser = {}
  for (const [channelId, users] of Object.entries(departures)) {
    const fresh = Object.entries(users).filter(([, at]) => now - at < REJOIN_IGNORE_MS)
    if (fresh.length > 0) kept[channelId] = Object.fromEntries(fresh)
  }
  return kept
}

/** Alguém saiu: perde o selo e a volta rápida deixa de valer como chegada. */
export function recordLeave(
  s: ArrivalState,
  channelId: string,
  userId: string,
  now: number
): ArrivalState {
  return {
    ...s,
    arrivals: drop(s.arrivals, channelId, userId),
    departures: put(trimDepartures(s.departures, now), channelId, userId, now)
  }
}

/** A próxima lista é só base (o WebSocket reconectou). */
export function resetBaseline(s: ArrivalState): ArrivalState {
  return s.snapshot ? { ...s, snapshot: null } : s
}

function isBaseline(s: ArrivalState, serverId: string, now: number): boolean {
  const prev = s.snapshot
  return !prev || prev.serverId !== serverId || now - prev.at > STALE_SNAPSHOT_MS
}

function pairsMissingFrom(a: VoiceMembers, b: VoiceMembers): [string, string][] {
  return Object.entries(a).flatMap(([channelId, users]) =>
    users.filter((u) => !b[channelId]?.includes(u)).map((u): [string, string] => [channelId, u])
  )
}

/** Uma lista nova dos canais de voz do servidor aberto: acha quem chegou e quem saiu. */
export function ingestSnapshot(
  s: ArrivalState,
  serverId: string,
  members: VoiceMembers,
  meId: string | undefined,
  now: number
): ArrivalState {
  const snapshot = { serverId, at: now, members }
  if (isBaseline(s, serverId, now)) return { ...s, snapshot }
  const before = s.snapshot!.members
  let next: ArrivalState = { ...s, snapshot }
  for (const [channelId, userId] of pairsMissingFrom(before, members)) {
    next = recordLeave(next, channelId, userId, now)
  }
  for (const [channelId, userId] of pairsMissingFrom(members, before)) {
    next = addArrival(next, channelId, userId, meId, now)
  }
  return next
}

/** Tira os selos vencidos. */
export function pruneExpired(s: ArrivalState, now: number): ArrivalState {
  const arrivals: ByChannelUser = {}
  for (const [channelId, users] of Object.entries(s.arrivals)) {
    const live = Object.entries(users).filter(([, expiresAt]) => expiresAt > now)
    if (live.length > 0) arrivals[channelId] = Object.fromEntries(live)
  }
  return { ...s, arrivals }
}

/** Quando vence o próximo selo (null = nenhum). */
export function nextExpiry(arrivals: ByChannelUser): number | null {
  const all = Object.values(arrivals).flatMap((users) => Object.values(users))
  return all.length > 0 ? Math.min(...all) : null
}
