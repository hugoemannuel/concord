import { MAX_LINKS, linkError, normalizeLink } from './profileLinks'
import { NAME_CHARS_MESSAGE, nameCharsError } from '../../auth/lib/nameChars'
import { resolveNameStyle, type NameStyle } from './nameStyle'
import { resolveProfileTheme, type ProfileTheme } from './profileTheme'

// Rascunho do editor de perfil (Configurações → Perfis). Os limites são os do
// backend (internal/user/profile.go) e do Discord.

export const MAX_DISPLAY_NAME = 32
export const MAX_PRONOUNS = 40
export const MAX_BIO = 190
export const MAX_STATUS_TEXT = 128
/** Avatar e banner: 10 MB, como no Discord (o backend usa o mesmo número). */
export const MAX_PROFILE_IMAGE_BYTES = 10 * 1024 * 1024
export const PROFILE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

/** O que fazer com o avatar/banner ao salvar. */
export type MediaChange =
  | { kind: 'keep' }
  | { kind: 'remove' }
  | { kind: 'set'; uri: string; name: string; mimeType: string; size: number; animated: boolean }

export interface ProfileFields {
  display_name: string
  pronouns: string
  bio: string
  status_text: string
  banner_color: string | null
  links: string[]
  name_style: NameStyle
  profile_theme: ProfileTheme
}

export interface ProfileDraft extends ProfileFields {
  avatar: MediaChange
  banner: MediaChange
}

export type ProfileErrors = Partial<Record<keyof ProfileFields, string>> & {
  /** Erro de cada link, na mesma posição. */
  linkErrors?: (string | null)[]
}

/** Caracteres de verdade (emoji conta como um, como no Go). */
export const charCount = (text: string): number => Array.from(text).length

/** Rascunho a partir do usuário salvo (links vêm do backend como {url}). */
export function draftFromProfile(
  profile: Partial<Omit<ProfileFields, 'links' | 'name_style' | 'profile_theme'>> & {
    links?: unknown
    name_style?: Partial<NameStyle> | null
    profile_theme?: Partial<ProfileTheme> | null
  }
): ProfileDraft {
  const links = Array.isArray(profile.links)
    ? profile.links
        .map((l) => (typeof l === 'string' ? l : (l as { url?: string })?.url))
        .filter((l): l is string => typeof l === 'string')
    : []
  return {
    display_name: profile.display_name ?? '',
    pronouns: profile.pronouns ?? '',
    bio: profile.bio ?? '',
    status_text: profile.status_text ?? '',
    banner_color: profile.banner_color ?? null,
    links,
    name_style: resolveNameStyle(profile.name_style),
    profile_theme: resolveProfileTheme(profile.profile_theme),
    avatar: { kind: 'keep' },
    banner: { kind: 'keep' }
  }
}

export function profileErrors(draft: ProfileFields): ProfileErrors {
  const errors: ProfileErrors = {}
  const name = draft.display_name.trim()
  if (charCount(name) < 1) errors.display_name = 'Escolha um nome de exibição.'
  else if (charCount(name) > MAX_DISPLAY_NAME)
    errors.display_name = `Até ${MAX_DISPLAY_NAME} caracteres.`
  else if (nameCharsError(name)) errors.display_name = NAME_CHARS_MESSAGE
  if (charCount(draft.pronouns.trim()) > MAX_PRONOUNS)
    errors.pronouns = `Até ${MAX_PRONOUNS} caracteres.`
  if (charCount(draft.bio.trim()) > MAX_BIO) errors.bio = `Até ${MAX_BIO} caracteres.`
  if (charCount(draft.status_text.trim()) > MAX_STATUS_TEXT)
    errors.status_text = `Até ${MAX_STATUS_TEXT} caracteres.`
  if (draft.banner_color && !/^#[0-9a-f]{6}$/i.test(draft.banner_color))
    errors.banner_color = 'Cor inválida.'

  if (draft.links.length > MAX_LINKS) errors.links = `Até ${MAX_LINKS} links.`
  const seen = new Set<string>()
  const linkErrors = draft.links.map((raw) => {
    const url = normalizeLink(raw)
    const err = linkError(url)
    if (err) return err
    const key = url.toLowerCase()
    if (seen.has(key)) return 'Esse link já está no perfil.'
    seen.add(key)
    return null
  })
  if (linkErrors.some(Boolean)) errors.linkErrors = linkErrors
  return errors
}

export const hasErrors = (errors: ProfileErrors): boolean =>
  Object.entries(errors).some(([key, value]) =>
    key === 'linkErrors' ? (value as (string | null)[]).some(Boolean) : Boolean(value)
  )

/** O que vai no PUT /users/me/profile. */
export function profilePayload(draft: ProfileFields): ProfileFields {
  return {
    display_name: draft.display_name.trim(),
    pronouns: draft.pronouns.trim(),
    bio: draft.bio.trim(),
    status_text: draft.status_text.trim(),
    banner_color: draft.banner_color || null,
    links: draft.links.map(normalizeLink),
    name_style: resolveNameStyle(draft.name_style),
    profile_theme: resolveProfileTheme(draft.profile_theme)
  }
}

/** Erro do arquivo escolhido para avatar/banner, ou null. */
export function imageFileError(file: { type: string; size: number }): string | null {
  if (!PROFILE_IMAGE_TYPES.includes(file.type)) return 'Use uma imagem PNG, JPG, GIF ou WebP.'
  if (file.size > MAX_PROFILE_IMAGE_BYTES) return 'A imagem pode ter até 10 MB.'
  return null
}
