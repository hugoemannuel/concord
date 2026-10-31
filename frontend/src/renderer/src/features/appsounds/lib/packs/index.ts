import { SOUNDS } from '../../../call/lib/sounds'
import { SOUND_EVENTS, type SoundEvent } from '../events'
import { bolhas } from './bolhas'
import { cristal } from './cristal'
import { discreto } from './discreto'
import { espacial } from './espacial'
import { fliperama } from './fliperama'
import { marimba } from './marimba'
import type { SoundPack } from './types'

export type { SoundPack } from './types'

export const DEFAULT_PACK_ID = 'salinha'

/** Os sons de sempre do app (call/lib/sounds), como um pacote. */
const salinha: SoundPack = {
  id: DEFAULT_PACK_ID,
  label: 'Padrão Salinha',
  description: 'Os sons de sempre do app.',
  sounds: Object.fromEntries(SOUND_EVENTS.map((e) => [e, SOUNDS[e]])) as SoundPack['sounds']
}

/** Pacotes na ordem da tela. Todos sintetizados aqui: nenhum arquivo de terceiros. */
export const SOUND_PACKS: SoundPack[] = [salinha, fliperama, marimba, espacial, cristal, bolhas, discreto]

/** O pacote do id; desconhecido (saiu ou é de uma versão nova) cai no padrão. */
export function findPack(id: string): SoundPack {
  return SOUND_PACKS.find((p) => p.id === id) ?? salinha
}

export function packSound(packId: string, event: SoundEvent) {
  return findPack(packId).sounds[event]
}
