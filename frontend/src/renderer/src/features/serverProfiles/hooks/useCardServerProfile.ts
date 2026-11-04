import { useState } from 'react'
import { serverIdFromPath } from '../../servers/lib/serverNames'
import { useServerProfileStore } from '../store/serverProfileStore'
import type { ServerProfile } from '../lib/serverProfile'

export interface CardServerProfile {
  /** Servidor cujo perfil o cartão mostra (null = o global). */
  scopeId: string | null
  /** O servidor aberto, mesmo olhando o global (o atalho de edição usa). */
  openServerId: string | null
  profile?: ServerProfile
  /** A pessoa tem perfil no servidor aberto: o cartão oferece ver o global. */
  available: boolean
  showingGlobal: boolean
  /** De quem pedir o global ao alternar (null = voltar ao servidor). */
  nextGlobalFor: string | null
}

/** O servidor aberto na tela (em DM, amigos etc. não há perfil de servidor). */
export function openServerOf(serverId: string | undefined, pathname: string): string | null {
  return serverId && serverIdFromPath(pathname) === serverId ? serverId : null
}

/** O que o cartão mostra: `globalFor` guarda de quem foi o pedido de ver o global. */
export function cardServerProfile(input: {
  userId: string
  openServerId: string | null
  profile: ServerProfile | undefined
  globalFor: string | null
}): CardServerProfile {
  const { userId, openServerId, profile, globalFor } = input
  const available = Boolean(profile)
  const showingGlobal = available && globalFor === userId
  return {
    scopeId: showingGlobal ? null : openServerId,
    openServerId,
    profile: showingGlobal ? undefined : profile,
    available,
    showingGlobal,
    nextGlobalFor: showingGlobal ? null : userId
  }
}

/** Cartão de perfil: o perfil do servidor aberto e o "ver o global", como no Discord. */
export function useCardServerProfile(
  userId: string,
  serverId: string | undefined,
  pathname: string
): CardServerProfile & { toggle: () => void } {
  const [globalFor, setGlobalFor] = useState<string | null>(null)
  const openServerId = openServerOf(serverId, pathname)
  const profile = useServerProfileStore((s) =>
    openServerId ? s.byServer[openServerId]?.[userId] : undefined
  )
  const card = cardServerProfile({ userId, openServerId, profile, globalFor })
  return { ...card, toggle: () => setGlobalFor(card.nextGlobalFor) }
}
