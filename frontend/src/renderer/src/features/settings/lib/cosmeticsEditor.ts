import { resolveNameplateMode, type NameplateMode } from '../../profile/lib/cosmetics'
import { isAnimatedMedia } from '../../profile/lib/profileMedia'

// Regras do modal "Faixa e moldura" (Configurações → Perfis). Cada escolha
// salva na hora, como os outros modais.

/** O que fazer ao escolher uma opção da faixa: trocar o modo ou abrir o arquivo. */
export type NameplateAction = { kind: 'mode'; mode: NameplateMode } | { kind: 'pick' }

interface NameplateState {
  nameplate_mode?: NameplateMode
  nameplate_custom_url?: string | null
}

/**
 * "Imagem própria" com uma imagem guardada e fora de uso volta a usá-la; sem
 * imagem, ou já em uso, abre o arquivo (para trocar).
 */
export function nameplateChoice(choice: NameplateMode, user: NameplateState): NameplateAction {
  if (choice !== 'custom') return { kind: 'mode', mode: choice }
  const inUse = resolveNameplateMode(user.nameplate_mode) === 'custom'
  if (user.nameplate_custom_url && !inUse) return { kind: 'mode', mode: 'custom' }
  return { kind: 'pick' }
}

/** O efeito de escolher uma opção: abrir o arquivo, o modo a gravar ou nada. */
export function nameplateEffect(
  choice: NameplateMode,
  user: NameplateState | null
): 'pick' | NameplateMode | null {
  const state = user ?? {}
  const action = nameplateChoice(choice, state)
  if (action.kind === 'pick') return 'pick'
  return action.mode === resolveNameplateMode(state.nameplate_mode) ? null : action.mode
}

export function hasAnimation(...urls: (string | null | undefined)[]): boolean {
  return urls.some((url) => isAnimatedMedia(url))
}

export interface PreviewRow {
  label: 'Parada' | 'Animando'
  animate: boolean
}

/** As linhas da prévia: "Animando" só quando algo ali é GIF. */
export function previewRows(user: {
  avatar_url?: string | null
  nameplate_url?: string | null
  avatar_decoration_url?: string | null
}): PreviewRow[] {
  const still: PreviewRow = { label: 'Parada', animate: false }
  if (!hasAnimation(user.avatar_url, user.nameplate_url, user.avatar_decoration_url)) return [still]
  return [still, { label: 'Animando', animate: true }]
}

const STEP: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }

/** Próxima opção de um grupo de rádio pelas setas (dá a volta); null = outra tecla. */
export function radioStep(current: number, key: string, length: number): number | null {
  const step = STEP[key]
  if (step === undefined) return null
  return (current + step + length) % length
}
