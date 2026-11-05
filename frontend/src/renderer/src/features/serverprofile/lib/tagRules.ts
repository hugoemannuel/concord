// Regras da tag do servidor, as mesmas do backend
// (internal/serverprofile/validate.go). Puro.

import { TAG_BADGES } from '../../../shared/ui/icons/serverTagBadges'
import type { ServerTag, TagEdit } from '../api/serverProfile'

export const MAX_TAG_NAME = 4

/** Cores prontas do emblema (a pessoa também pode escolher qualquer outra). */
export const TAG_COLORS: readonly string[] = [
  '#f47fa8',
  '#ed8a4c',
  '#e8c547',
  '#7ed67e',
  '#4fd1c5',
  '#63b3ed',
  '#7f9cf5',
  '#b794f4',
  '#e2e8f0',
  '#a0aec0'
]

export const DEFAULT_TAG: TagEdit = { name: '', badge: 'estrela', color: TAG_COLORS[4] }

const NAME = /^[A-Za-z0-9]{1,4}$/
const COLOR = /^#[0-9a-fA-F]{6}$/

/** O que dá para digitar: só letras e números ASCII, até 4. */
export function cleanTagName(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, '').slice(0, MAX_TAG_NAME)
}

/** O motivo de não poder salvar; null = pode (nome vazio tira a tag). */
export function tagProblem(tag: TagEdit): string | null {
  if (!tag.name) return null
  if (!NAME.test(tag.name)) return 'O nome aceita até 4 letras e números.'
  if (!TAG_BADGES.some((b) => b.id === tag.badge)) return 'Escolha um emblema.'
  return COLOR.test(tag.color) ? null : 'Escolha uma cor.'
}

/** Trocar o nome (ou tirar a tag) obriga os membros a reaplicar. */
export function tagRenameWarning(saved: ServerTag | null, draft: TagEdit): boolean {
  return saved !== null && saved.name !== draft.name
}

export function tagEditFrom(tag: ServerTag | null | undefined): TagEdit {
  return tag ? { name: tag.name, badge: tag.badge, color: tag.color } : { ...DEFAULT_TAG }
}
