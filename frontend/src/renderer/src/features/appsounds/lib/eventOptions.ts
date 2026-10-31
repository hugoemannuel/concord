import { findPack, SOUND_PACKS } from './packs'

export interface EventOption {
  value: string
  label: string
}

/**
 * Opções do seletor de um evento: seguir o pacote escolhido, um pacote
 * específico, o áudio próprio (se a pessoa subiu um) ou nenhum som.
 */
export function eventOptions(packId: string, hasCustom: boolean): EventOption[] {
  return [
    { value: 'pack', label: `Do pacote (${findPack(packId).label})` },
    ...SOUND_PACKS.map((p) => ({ value: p.id, label: p.label })),
    ...(hasCustom ? [{ value: 'custom', label: 'Meu áudio' }] : []),
    { value: 'off', label: 'Sem som' }
  ]
}

/** Volume em texto, como o resto das configurações: "120%". */
export const volumeLabel = (volume: number): string => `${volume}%`
