import { normalizeSearch } from '../../emojis/lib/baseEmojis'
import {
  orderServers,
  serverSections,
  withItemServers,
  type PickerServer,
  type ServerSection
} from '../../emojis/lib/pickerSections'

/**
 * Como a mesa de áudio se monta, igual ao seletor de figurinhas: os favoritos
 * da pessoa e uma seção por servidor dela (o da chamada primeiro), sem repetir
 * nas seções o que já está nos favoritos.
 */
interface NamedSound {
  id: string
  name: string
}

export interface SoundboardLayout<S, F> {
  favorites: F[]
  sections: ServerSection<S>[]
}

export function soundboardLayout<S extends NamedSound, F extends NamedSound>({
  servers,
  extraServers = [],
  soundsByServer,
  favorites,
  currentId,
  search
}: {
  servers: PickerServer[]
  /** Servidores fora da lista (o da visita, para quem é visitante na chamada). */
  extraServers?: PickerServer[]
  soundsByServer: Record<string, S[]>
  favorites: F[]
  currentId: string
  search: string
}): SoundboardLayout<S, F> {
  const query = normalizeSearch(search.trim())
  const favoriteIds = new Set(favorites.map((f) => f.id))
  return {
    favorites: query ? favorites.filter((f) => normalizeSearch(f.name).includes(query)) : favorites,
    sections: serverSections({
      servers: withItemServers(servers, extraServers),
      itemsOf: (id) => (soundsByServer[id] ?? []).filter((s) => !favoriteIds.has(s.id)),
      nameOf: (s: S) => s.name,
      currentId,
      search
    })
  }
}

/** Todos os sons carregados, os do servidor da chamada primeiro (atalhos de teclado). */
export function allServerSounds<S>(soundsByServer: Record<string, S[]>, currentId: string): S[] {
  const ids = orderServers(Object.keys(soundsByServer).map((id) => ({ id })), currentId)
  return ids.flatMap(({ id }) => soundsByServer[id] ?? [])
}

/** O som cujo atalho de teclado é este (sem diferenciar maiúsculas). */
export function findSoundForShortcut<S extends { id: string }>(
  shortcut: string,
  keybinds: Record<string, string>,
  sounds: S[]
): S | undefined {
  const wanted = shortcut.toLowerCase()
  return sounds.find((s) => keybinds[s.id]?.toLowerCase() === wanted)
}
