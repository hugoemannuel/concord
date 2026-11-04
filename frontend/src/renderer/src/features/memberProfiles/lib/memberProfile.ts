import type { ProfileLink, User } from '../../auth/store/authStore'
import type { NameplateMode } from '../../profile/lib/cosmetics'
import type { NameStyle } from '../../profile/lib/nameStyle'
import { resolveNameStyle } from '../../profile/lib/nameStyle'
import type { ProfileTheme } from '../../profile/lib/profileTheme'
import { resolveProfileTheme } from '../../profile/lib/profileTheme'
import type { UserLook } from '../../profile/store/profileStore'

// Perfil por servidor (ADR 0051): só os campos sobrescritos; ausente = herda do
// perfil global. Tudo aqui é regra pura: quem resolve o que aparece em um
// servidor passa por estas funções. O nome é o apelido (serverNames).

/** Os campos sobrescritos, como vêm em `member_profile` de cada membro. */
export interface MemberProfile {
  avatar_url?: string | null
  banner_url?: string | null
  banner_color?: string | null
  pronouns?: string | null
  bio?: string | null
  status_text?: string | null
  links?: ProfileLink[] | null
  name_style?: NameStyle | null
  profile_theme?: ProfileTheme | null
  /** "off" esconde a faixa só neste servidor. */
  nameplate_mode?: NameplateMode | null
  /** Faixa efetiva, quando depende do perfil do servidor. */
  nameplate_url?: string | null
  avatar_decoration_url?: string | null
  /** Imagem própria guardada: só a própria pessoa recebe. */
  nameplate_custom_url?: string | null
}

/** O perfil do servidor visto pelo editor (GET /servers/:id/profile). */
export interface MemberProfileView {
  server_id: string
  user_id: string
  profile: MemberProfile
  has_profile: boolean
  nickname: string | null
  can_change_nickname: boolean
}

/** A faixa num servidor: o modo sobrescrito manda; sem ele, herda. */
export function overlayNameplate(
  globalUrl: string | null | undefined,
  o: MemberProfile | null | undefined
): string | null {
  if (!o?.nameplate_mode) return o?.nameplate_url ?? globalUrl ?? null
  return o.nameplate_mode === 'off' ? null : (o.nameplate_url ?? null)
}

/** Nome, avatar, faixa e moldura com o perfil do servidor por cima. */
export function overlayLook(look: UserLook, o: MemberProfile | null | undefined): UserLook {
  if (!o) return look
  return {
    name: look.name,
    avatarUrl: o.avatar_url ?? look.avatarUrl,
    nameplateUrl: overlayNameplate(look.nameplateUrl, o),
    decorationUrl: o.avatar_decoration_url ?? look.decorationUrl
  }
}

interface ProfileFields {
  avatar_url?: string | null
  banner_url?: string | null
  banner_color?: string | null
  pronouns?: string
  bio?: string
  status_text?: string
  links?: ProfileLink[]
  name_style?: NameStyle
  profile_theme?: ProfileTheme
  nameplate_url?: string | null
  avatar_decoration_url?: string | null
}

/** Um perfil (público ou o da sessão) com os campos do servidor por cima. */
export function overlayProfile<T extends ProfileFields>(
  source: T,
  o: MemberProfile | null | undefined
): T {
  if (!o) return source
  return {
    ...source,
    avatar_url: o.avatar_url ?? source.avatar_url,
    banner_url: o.banner_url ?? source.banner_url,
    banner_color: o.banner_color ?? source.banner_color,
    pronouns: o.pronouns ?? source.pronouns,
    bio: o.bio ?? source.bio,
    status_text: o.status_text ?? source.status_text,
    links: o.links ?? source.links,
    name_style: o.name_style ?? source.name_style,
    profile_theme: o.profile_theme ?? source.profile_theme,
    nameplate_url: overlayNameplate(source.nameplate_url, o),
    avatar_decoration_url: o.avatar_decoration_url ?? source.avatar_decoration_url
  }
}

/** user:update traz o global: quem tem perfil no servidor continua com o dele. */
export function memberLookWith<T extends { avatar_url?: string | null; name_style?: NameStyle }>(
  look: T,
  o: MemberProfile | null | undefined
): T {
  if (!o) return look
  return {
    ...look,
    avatar_url: o.avatar_url ?? look.avatar_url,
    name_style: o.name_style ?? look.name_style
  }
}

/**
 * Pessoas de uma call de servidor com avatar e estilo de lá (a janela do
 * overlay recebe URLs prontas). Sem ninguém com perfil, a mesma lista.
 */
export function withMemberProfiles<T extends { id: string; avatar_url?: string | null }>(
  people: T[],
  profiles: Record<string, MemberProfile> | undefined
): T[] {
  if (!profiles || !people.some((p) => profiles[p.id])) return people
  return people.map((p) => {
    const o = profiles[p.id]
    if (!o) return p
    return { ...p, avatar_url: o.avatar_url ?? p.avatar_url, ...(o.name_style ? { name_style: o.name_style } : {}) }
  })
}

/** userId -> perfil de quem tem perfil no servidor (a lista de membros). */
export function profilesFromMembers(
  members: { user_id: string; member_profile?: MemberProfile | null }[]
): Record<string, MemberProfile> {
  const map: Record<string, MemberProfile> = {}
  for (const m of members) if (m.member_profile) map[m.user_id] = m.member_profile
  return map
}

/** O usuário como aparece no servidor: o que o editor e a prévia mostram. */
export function effectiveUser(user: User, view: MemberProfileView | null): User {
  if (!view) return user
  const o = view.profile
  return {
    ...overlayProfile(user, o),
    display_name: view.nickname || user.display_name,
    // Apelido sem estilo próprio aparece sem estilo (a regra de sempre).
    name_style: o.name_style ?? (view.nickname ? resolveNameStyle(null) : user.name_style),
    nameplate_mode: o.nameplate_mode ?? user.nameplate_mode,
    // Só a imagem deste servidor: a global não pode ser apagada daqui.
    nameplate_custom_url: o.nameplate_custom_url ?? null
  }
}

/** Blocos do editor que dá para voltar ao padrão, um a um. */
export type MemberProfileField =
  | 'name'
  | 'banner_color'
  | 'profile_theme'
  | 'pronouns'
  | 'status_text'
  | 'bio'
  | 'links'
  | 'cosmetics'

/** O bloco está sobrescrito neste servidor? */
export function isOverridden(field: MemberProfileField, view: MemberProfileView | null): boolean {
  if (!view) return false
  const o = view.profile
  if (field === 'name') return nameOverridden(view)
  if (field === 'cosmetics') {
    return Boolean(o.nameplate_mode || o.nameplate_custom_url || o.avatar_decoration_url)
  }
  return o[field] !== undefined && o[field] !== null
}

/** Sem CHANGE_NICKNAME o apelido não é da pessoa: "Voltar ao padrão" só cuida do estilo. */
function nameOverridden(view: MemberProfileView): boolean {
  return Boolean(view.profile.name_style) || Boolean(view.nickname && view.can_change_nickname)
}

/** O PATCH que volta o bloco ao padrão (a faixa e a moldura têm rotas próprias). */
export function resetPatch(field: Exclude<MemberProfileField, 'cosmetics'>): Record<string, null> {
  return field === 'name' ? { name_style: null } : { [field]: null }
}

/** O que o modal mudou: compara como JSON (listas e objetos). */
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

export interface FieldValues {
  pronouns: string
  bio: string
  status_text: string
  banner_color: string | null
  links: string[]
  name_style: NameStyle
  profile_theme: ProfileTheme
}

/** Os campos do perfil global, para saber o que é igual ao herdado. */
export function globalFieldValues(user: User, nickname: string | null): FieldValues {
  return {
    pronouns: user.pronouns ?? '',
    bio: user.bio ?? '',
    status_text: user.status_text ?? '',
    banner_color: user.banner_color ?? null,
    links: (user.links ?? []).map((l) => l.url),
    // Com apelido, herdar o estilo é ficar sem estilo.
    name_style: resolveNameStyle(nickname ? null : user.name_style),
    profile_theme: resolveProfileTheme(user.profile_theme)
  }
}

/**
 * Do que o modal aplicou ao corpo do PATCH: igual ao que já aparecia não muda
 * nada; igual ao global volta a herdar (null); diferente sobrescreve. Assim
 * abrir um modal e aplicar sem mexer não cria perfil de servidor.
 */
export function patchFromFields(
  next: Partial<FieldValues>,
  shown: FieldValues,
  inherited: FieldValues
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const key of Object.keys(next) as (keyof FieldValues)[]) {
    const value = next[key]
    if (same(value, shown[key])) continue
    if (same(value, inherited[key])) patch[key] = null
    else patch[key] = key === 'links' ? (value as string[]).map((url) => ({ url })) : value
  }
  return patch
}

export type NicknameAction = { change: false } | { change: true; nickname: string }

/** O que fazer com o apelido: o nome igual ao global tira o apelido (herda). */
export function nicknameAction(
  name: string | undefined,
  shownName: string,
  globalName: string
): NicknameAction {
  const trimmed = name?.trim()
  if (!trimmed || trimmed === shownName) return { change: false }
  return { change: true, nickname: trimmed === globalName ? '' : trimmed }
}
