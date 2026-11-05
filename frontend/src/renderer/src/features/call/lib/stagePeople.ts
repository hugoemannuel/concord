import type { User } from '../../auth/store/authStore'
import { serverDisplayName } from '../../servers/lib/serverNames'
import type { CallUserInfo } from '../store/callStore'
import type { ScreenEntry } from './screenWatch'

// Quem aparece onde no palco da chamada (lógica pura do CallStage).

export type StageMode = 'music' | 'voice' | 'focus' | 'mosaic'

/** Qual visão o palco mostra: vídeo da música, só voz, live em foco ou mosaico. */
export function stageMode(input: {
  musicStage: boolean
  hasScreens: boolean
  hasCameras: boolean
  hasFocus: boolean
}): StageMode {
  if (input.musicStage) return 'music'
  if (!input.hasScreens && !input.hasCameras) return 'voice'
  return input.hasFocus ? 'focus' : 'mosaic'
}

/**
 * A música em cartaz quando o vídeo dela ocupa o palco (ligado, num canal de
 * servidor e com vídeo), ou null.
 */
export function musicStageNow<T extends { item: { has_video?: boolean } }>(
  stageVideo: boolean,
  serverId: string | undefined,
  now: T | null
): T | null {
  return stageVideo && serverId && now?.item.has_video ? now : null
}

/** Meus dados no palco; o apelido do servidor, se houver, vale no lugar do nome e do estilo. */
export function buildMeInfo(
  me: User | null,
  nickname: string | undefined,
  meId: string
): CallUserInfo {
  return {
    id: meId,
    username: me?.username ?? '',
    display_name: serverDisplayName({ nickname }, me, 'Você'),
    avatar_url: me?.avatar_url ?? null,
    avatar_decoration_url: me?.avatar_decoration_url ?? null,
    nameplate_url: me?.nameplate_url ?? null,
    name_style: nickname ? null : me?.name_style
  }
}

export interface CameraEntry {
  userId: string
  stream: MediaStream
}

/** Câmeras ligadas: a minha primeiro, depois a de quem está na chamada. */
export function buildCameraEntries(
  meId: string,
  localCameraStream: MediaStream | null,
  participants: { id: string }[],
  videoStreams: Record<string, MediaStream>
): CameraEntry[] {
  const others = participants
    .filter((p) => videoStreams[p.id])
    .map((p) => ({ userId: p.id, stream: videoStreams[p.id] }))
  return localCameraStream ? [{ userId: meId, stream: localCameraStream }, ...others] : others
}

/** Pessoas da faixa sob a live: sem quem está em cima e sem quem já tem tela própria. */
export function stripPeople<T extends { id: string }>(
  people: T[],
  availableScreens: string[],
  exceptId?: string
): T[] {
  return people.filter((p) => p.id !== exceptId && !availableScreens.includes(p.id))
}

/** O que sobra embaixo do mosaico: eu (sem vídeo) e quem não tem vídeo nenhum. */
export function mosaicRest<T extends { id: string }>(
  screens: { userId: string }[],
  cameras: { userId: string }[],
  meId: string,
  people: T[]
): { showMe: boolean; others: T[]; show: boolean } {
  const inMosaic = new Set([...screens, ...cameras].map((entry) => entry.userId))
  const showMe = !inMosaic.has(meId)
  const others = people.filter((p) => !inMosaic.has(p.id))
  return { showMe, others, show: showMe || others.length > 0 }
}

/**
 * Props extras de uma tela que estou assistindo: a minha não tem fechar nem
 * áudio nem tela cheia; a dos outros tem.
 */
export function watchedExtras(
  entry: Pick<ScreenEntry, 'userId' | 'local'>,
  stopWatching: (userId: string) => void
): { onClose?: () => void; streamAudioUserId?: string; fullscreenable: boolean } {
  if (entry.local) return { fullscreenable: false }
  return {
    onClose: () => stopWatching(entry.userId),
    streamAudioUserId: entry.userId,
    fullscreenable: true
  }
}
