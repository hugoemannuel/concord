import { describe, expect, it } from 'vitest'
import type { User } from '../../auth/store/authStore'
import { resolveNameStyle, type NameStyle } from '../../profile/lib/nameStyle'
import { resolveProfileTheme } from '../../profile/lib/profileTheme'
import {
  effectiveUser,
  globalFieldValues,
  isOverridden,
  memberLookWith,
  nicknameAction,
  overlayLook,
  overlayNameplate,
  overlayProfile,
  patchFromFields,
  profilesFromMembers,
  resetPatch,
  withServerProfiles,
  type ServerProfileView
} from './serverProfile'

const style = { font: 'mono', effect: 'none', colors: [] } as unknown as NameStyle

const user = {
  id: 'u1',
  username: 'ana',
  display_name: 'Ana',
  avatar_url: '/global-avatar',
  banner_url: '/global-banner',
  banner_color: '#111111',
  pronouns: 'ela',
  bio: 'global',
  status_text: 'nota',
  links: [{ url: 'https://a.co' }],
  name_style: style,
  nameplate_url: '/global-faixa',
  avatar_decoration_url: '/global-moldura',
  nameplate_mode: 'custom',
  nameplate_custom_url: '/global-faixa'
} as unknown as User

const view = (over: Partial<ServerProfileView> = {}): ServerProfileView => ({
  server_id: 's1',
  user_id: 'u1',
  profile: {},
  has_profile: false,
  nickname: null,
  can_change_nickname: true,
  ...over
})

describe('overlayNameplate', () => {
  it('sem perfil, herda', () => {
    expect(overlayNameplate('/g', undefined)).toBe('/g')
    expect(overlayNameplate('/g', {})).toBe('/g')
    expect(overlayNameplate(null, {})).toBeNull()
  })
  it('a faixa efetiva do servidor ganha', () => {
    expect(overlayNameplate('/g', { nameplate_url: '/s' })).toBe('/s')
  })
  it('modo off esconde só aqui e modo sem imagem não herda a global', () => {
    expect(overlayNameplate('/g', { nameplate_mode: 'off' })).toBeNull()
    expect(overlayNameplate('/g', { nameplate_mode: 'banner' })).toBeNull()
    expect(overlayNameplate('/g', { nameplate_mode: 'custom', nameplate_url: '/s' })).toBe('/s')
  })
})

describe('overlayLook', () => {
  const look = { name: 'Ana', avatarUrl: '/a', nameplateUrl: '/f', decorationUrl: '/m' }
  it('sem perfil do servidor nada muda (o mesmo objeto)', () => {
    expect(overlayLook(look, undefined)).toBe(look)
  })
  it('herda e sobrescreve campo a campo', () => {
    expect(overlayLook(look, { avatar_url: '/s' })).toEqual({ ...look, avatarUrl: '/s' })
    expect(overlayLook(look, { avatar_decoration_url: '/sm' })).toEqual({
      ...look,
      decorationUrl: '/sm'
    })
  })
})

describe('overlayProfile', () => {
  it('sem perfil do servidor, o mesmo objeto', () => {
    expect(overlayProfile(user, undefined)).toBe(user)
  })
  it('só os campos sobrescritos mudam; texto vazio também é valor', () => {
    const out = overlayProfile(user, { bio: '', banner_color: '#222222' })
    expect(out.bio).toBe('')
    expect(out.banner_color).toBe('#222222')
    expect(out.pronouns).toBe('ela')
    expect(out.avatar_url).toBe('/global-avatar')
  })
})

describe('memberLookWith', () => {
  const look = { display_name: 'Novo', avatar_url: '/novo', name_style: style }
  it('user:update não apaga o que é do servidor', () => {
    const other = resolveNameStyle(null)
    expect(memberLookWith(look, { avatar_url: '/s', name_style: other })).toEqual({
      display_name: 'Novo',
      avatar_url: '/s',
      name_style: other
    })
  })
  it('sem perfil, o global novo', () => {
    expect(memberLookWith(look, undefined)).toBe(look)
  })
})

describe('withServerProfiles', () => {
  const people = [{ id: 'u1', avatar_url: '/a' }, { id: 'u2', avatar_url: '/b' }]
  it('sem ninguém com perfil devolve a mesma lista', () => {
    expect(withServerProfiles(people, undefined)).toBe(people)
    expect(withServerProfiles(people, { u9: { bio: 'x' } })).toBe(people)
  })
  it('só quem tem perfil muda', () => {
    const out = withServerProfiles(people, { u1: { avatar_url: '/s' } })
    expect(out[0].avatar_url).toBe('/s')
    expect(out[1]).toBe(people[1])
  })
})

describe('profilesFromMembers', () => {
  it('só entra quem tem perfil', () => {
    expect(
      profilesFromMembers([
        { user_id: 'a', server_profile: { bio: 'x' } },
        { user_id: 'b' },
        { user_id: 'c', server_profile: null }
      ])
    ).toEqual({ a: { bio: 'x' } })
  })
})

describe('effectiveUser', () => {
  it('sem perfil, o global', () => {
    expect(effectiveUser(user, null)).toBe(user)
    const out = effectiveUser(user, view())
    expect(out.display_name).toBe('Ana')
    expect(out.bio).toBe('global')
    expect(out.name_style).toEqual(style)
  })
  it('apelido é o nome e, sem estilo próprio, tira o estilo', () => {
    const out = effectiveUser(user, view({ nickname: 'Aninha' }))
    expect(out.display_name).toBe('Aninha')
    expect(out.name_style).toEqual(resolveNameStyle(null))
  })
  it('apelido com estilo do servidor fica com o estilo', () => {
    const out = effectiveUser(user, view({ nickname: 'Aninha', profile: { name_style: style } }))
    expect(out.name_style).toEqual(style)
  })
  it('a imagem própria da faixa é só a deste servidor', () => {
    expect(effectiveUser(user, view()).nameplate_custom_url).toBeNull()
    expect(
      effectiveUser(user, view({ profile: { nameplate_custom_url: '/s' } })).nameplate_custom_url
    ).toBe('/s')
  })
})

describe('isOverridden', () => {
  it('campo simples: vazio conta, ausente não', () => {
    expect(isOverridden('bio', view({ profile: { bio: '' } }))).toBe(true)
    expect(isOverridden('bio', view())).toBe(false)
    expect(isOverridden('bio', null)).toBe(false)
  })
  it('nome: apelido só conta se a pessoa pode mexer nele', () => {
    expect(isOverridden('name', view({ nickname: 'A' }))).toBe(true)
    expect(isOverridden('name', view({ nickname: 'A', can_change_nickname: false }))).toBe(false)
    expect(isOverridden('name', view({ profile: { name_style: style }, can_change_nickname: false }))).toBe(true)
  })
  it('faixa e moldura', () => {
    expect(isOverridden('cosmetics', view({ profile: { nameplate_mode: 'off' } }))).toBe(true)
    expect(isOverridden('cosmetics', view({ profile: { avatar_decoration_url: '/m' } }))).toBe(true)
    expect(isOverridden('cosmetics', view({ profile: { bio: 'x' } }))).toBe(false)
  })
})

describe('resetPatch', () => {
  it('cada bloco zera o campo dele', () => {
    expect(resetPatch('bio')).toEqual({ bio: null })
    expect(resetPatch('name')).toEqual({ name_style: null })
  })
})

describe('patchFromFields', () => {
  const inherited = globalFieldValues(user, null)
  it('igual ao que já aparece não cria nada', () => {
    expect(patchFromFields({ bio: 'global', links: ['https://a.co'] }, inherited, inherited)).toEqual({})
  })
  it('diferente sobrescreve; links viram objetos', () => {
    expect(patchFromFields({ bio: 'aqui', links: ['https://b.co'] }, inherited, inherited)).toEqual({
      bio: 'aqui',
      links: [{ url: 'https://b.co' }]
    })
  })
  it('voltar ao valor do global é herdar', () => {
    const shown = { ...inherited, bio: 'aqui' }
    expect(patchFromFields({ bio: 'global' }, shown, inherited)).toEqual({ bio: null })
  })
  it('tirar a cor neste servidor é voltar a herdar', () => {
    const shown = { ...inherited, banner_color: '#222222' }
    expect(patchFromFields({ banner_color: null }, shown, inherited)).toEqual({ banner_color: null })
  })
  it('tema igual ao global não cria nada', () => {
    expect(patchFromFields({ profile_theme: resolveProfileTheme(null) }, inherited, inherited)).toEqual({})
  })
  it('com apelido, herdar o estilo é ficar sem estilo', () => {
    const withNick = globalFieldValues(user, 'Aninha')
    expect(withNick.name_style).toEqual(resolveNameStyle(null))
    expect(patchFromFields({ name_style: style }, withNick, withNick)).toEqual({ name_style: style })
  })
})

describe('nicknameAction', () => {
  it('sem mudança ou em branco não mexe', () => {
    expect(nicknameAction(undefined, 'Ana', 'Ana')).toEqual({ change: false })
    expect(nicknameAction('Ana', 'Ana', 'Ana')).toEqual({ change: false })
    expect(nicknameAction('   ', 'Ana', 'Ana')).toEqual({ change: false })
  })
  it('nome novo vira apelido; o nome global tira o apelido', () => {
    expect(nicknameAction('Aninha', 'Ana', 'Ana')).toEqual({ change: true, nickname: 'Aninha' })
    expect(nicknameAction('Ana', 'Aninha', 'Ana')).toEqual({ change: true, nickname: '' })
  })
})
