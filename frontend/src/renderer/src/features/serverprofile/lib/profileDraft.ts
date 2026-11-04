// O rascunho das seções de customização: o que está no formulário e o que muda
// ao salvar. O envio leva só o que mudou (o backend não toca no resto), então
// duas seções ou duas pessoas editando juntas não se desfazem. Puro.

import type {
  ProfilePatch,
  ServerArt,
  ServerCard,
  ServerGame,
  ServerProfile,
  ServerTheme,
  ServerTrait,
  TagEdit
} from '../api/serverProfile'
import { tagEditFrom } from './tagRules'

export const MAX_TRAITS = 5
export const MAX_TRAIT_TEXT = 24
export const MAX_DESCRIPTION = 300
export const MAX_GAMES = 8
export const EMPTY_TRAIT: ServerTrait = { emoji: '', text: '' }

export interface ProfileDraft {
  banner: ServerArt
  /** Sempre os 5 campos do formulário. */
  traits: ServerTrait[]
  description: string
  games: ServerGame[]
  private: boolean
  strip: ServerArt
  theme: ServerTheme
  tag: TagEdit
}

export function draftFromProfile(profile: ServerProfile): ProfileDraft {
  const traits = Array.from({ length: MAX_TRAITS }, (_, i) => profile.traits[i] ?? EMPTY_TRAIT)
  return {
    banner: profile.banner,
    traits,
    description: profile.description,
    games: profile.games,
    private: profile.private,
    strip: profile.strip,
    theme: profile.theme,
    tag: tagEditFrom(profile.tag)
  }
}

/** Os traços como serão gravados: aparados e sem os vazios. */
export function cleanTraits(traits: ServerTrait[]): ServerTrait[] {
  return traits
    .map((t) => ({ emoji: t.emoji.trim(), text: t.text.trim() }))
    .filter((t) => t.text !== '')
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/** Sem nome e sem tag salva, não há o que criar (mexer só na cor não conta). */
function tagPatch(profile: ServerProfile, draft: ProfileDraft): TagEdit | undefined {
  if (!profile.tag && !draft.tag.name) return undefined
  return same(tagEditFrom(profile.tag), draft.tag) ? undefined : draft.tag
}

/** Só o que mudou em relação ao salvo (vazio = nada para salvar). */
export function patchFromDraft(profile: ServerProfile, draft: ProfileDraft): ProfilePatch {
  const patch: ProfilePatch = {}
  const traits = cleanTraits(draft.traits)
  const description = draft.description.trim()
  if (!same(profile.banner, draft.banner)) patch.banner = draft.banner
  if (!same(profile.traits, traits)) patch.traits = traits
  if (profile.description !== description) patch.description = description
  if (!same(profile.games, draft.games)) patch.games = draft.games
  if (profile.private !== draft.private) patch.private = draft.private
  if (!same(profile.strip, draft.strip)) patch.strip = draft.strip
  if (!same(profile.theme, draft.theme)) patch.theme = draft.theme
  const tag = tagPatch(profile, draft)
  if (tag) patch.tag = tag
  return patch
}

/** O perfil como a prévia mostra: o salvo com o rascunho por cima. */
export function overlayDraft(profile: ServerProfile, draft: ProfileDraft, serverId: string): ServerProfile {
  return {
    ...profile,
    ...draft,
    traits: cleanTraits(draft.traits),
    tag: draft.tag.name ? { server_id: serverId, ...draft.tag } : null
  }
}

/** O cartão da prévia; null enquanto não há o que mostrar (carregando, sem acesso). */
export function previewCard(card: ServerCard | null, draft: ProfileDraft | null, serverId: string): ServerCard | null {
  if (!card?.profile || !draft) return null
  return { ...card, profile: overlayDraft(card.profile, draft, serverId) }
}
