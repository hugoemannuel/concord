import type { SoundboardItem } from '../api/soundboard'

// Mudanças na lista de sons de um servidor (soundboardStore): cada uma devolve
// a lista nova, sem mexer na de outros servidores.

type ByServer = Record<string, SoundboardItem[]>
export type SoundListEdit = (list: SoundboardItem[]) => SoundboardItem[]

export function editServerSounds(
  byServer: ByServer,
  serverId: string,
  edit: SoundListEdit
): ByServer {
  return { ...byServer, [serverId]: edit(byServer[serverId] ?? []) }
}

/** O som novo no topo (sem repetir o que já está). */
export const prependSound =
  (sound: SoundboardItem): SoundListEdit =>
  (list) =>
    list.some((x) => x.id === sound.id) ? list : [sound, ...list]

/** O som editado no lugar do antigo. */
export const replaceSound =
  (sound: SoundboardItem): SoundListEdit =>
  (list) =>
    list.map((x) => (x.id === sound.id ? sound : x))

export const withoutSound =
  (soundId: string): SoundListEdit =>
  (list) =>
    list.filter((x) => x.id !== soundId)
