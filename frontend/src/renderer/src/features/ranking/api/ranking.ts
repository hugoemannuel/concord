import { request } from '../../../shared/api/client'
import type { NameStyle } from '../../profile/lib/nameStyle'
import type { ProfileRelationship } from '../../profile/lib/profileRelationship'

/** Uma linha do ranking global (backend: internal/level/ranking.go). */
export interface RankingEntry {
  position: number
  user_id: string
  /** Vazio para quem não tem vínculo comigo (relationship = none). */
  username: string
  relationship: ProfileRelationship
  display_name: string
  avatar_url: string | null
  avatar_decoration_url?: string | null
  nameplate_url?: string | null
  name_style: NameStyle
  level: number
  xp: number
}

/** A posição de quem pediu, mesmo fora do top. */
export interface MyRank {
  position: number
  level: number
  xp: number
}

export interface Ranking {
  entries: RankingEntry[]
  /** Nulo para quem ainda não tem XP: não há posição a mostrar. */
  me: MyRank | null
}

export function fetchRanking(limit = 100): Promise<Ranking> {
  return request<Ranking>(`/levels/ranking?limit=${limit}`)
}
