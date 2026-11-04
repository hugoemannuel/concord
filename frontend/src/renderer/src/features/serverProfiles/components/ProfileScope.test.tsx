import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import Avatar from '../../../shared/ui/Avatar'
import StyledName from '../../profile/components/StyledName'
import { useProfileStore, useUserLook } from '../../profile/store/profileStore'
import { useServerProfileStore } from '../store/serverProfileStore'
import ProfileScope from './ProfileScope'

// No render de servidor o zustand devolve o estado inicial: o teste semeia o
// estado inicial do store antes de desenhar.
const seed = (byServer: Record<string, Record<string, object>>): void => {
  useServerProfileStore.setState({ byServer })
  ;(useServerProfileStore as unknown as { getInitialState: () => { byServer: unknown } }).getInitialState().byServer = byServer
}

const FALLBACK = { name: 'Ana', avatarUrl: '/da-mensagem', nameplateUrl: '/np', decorationUrl: null }

function LookProbe(): React.JSX.Element {
  const look = useUserLook('u1', FALLBACK)
  return <i data-avatar={look.avatarUrl ?? ''} data-plate={look.nameplateUrl ?? ''} data-name={look.name} />
}

const probe = (serverId?: string | null): string =>
  renderToStaticMarkup(
    serverId === undefined ? (
      <LookProbe />
    ) : (
      <ProfileScope serverId={serverId}>
        <LookProbe />
      </ProfileScope>
    )
  )

beforeEach(() => {
  useProfileStore.getState().reset()
  seed({})
})

describe('resolução dentro de um servidor', () => {
  it('sem perfil no servidor nada muda', () => {
    expect(probe('s1')).toContain('data-avatar="/da-mensagem"')
    seed({ s2: { u1: { avatar_url: '/outro' } } })
    expect(probe('s1')).toContain('data-avatar="/da-mensagem"')
  })

  it('sobrescreve só o campo definido e herda o resto', () => {
    seed({ s1: { u1: { avatar_url: '/s1' } } })
    const html = probe('s1')
    expect(html).toContain('data-avatar="/s1"')
    expect(html).toContain('data-plate="/np"')
    expect(html).toContain('data-name="Ana"')
  })

  it('fora do servidor (DM, amigos, ranking) é sempre o global', () => {
    seed({ s1: { u1: { avatar_url: '/s1' } } })
    expect(probe(null)).toContain('data-avatar="/da-mensagem"')
    expect(probe()).toContain('data-avatar="/da-mensagem"')
    expect(probe('s2')).toContain('data-avatar="/da-mensagem"')
  })
})

describe('Avatar', () => {
  const avatar = <Avatar userId="u1" name="Ana" avatarUrl="/api/profile-media/g" size={32} />

  it('usa a foto do servidor só no escopo daquele servidor', () => {
    seed({ s1: { u1: { avatar_url: '/api/profile-media/s1' } } })
    expect(renderToStaticMarkup(<ProfileScope serverId="s1">{avatar}</ProfileScope>)).toContain('/profile-media/s1')
    expect(renderToStaticMarkup(<ProfileScope serverId="s2">{avatar}</ProfileScope>)).toContain('/profile-media/g')
    expect(renderToStaticMarkup(avatar)).toContain('/profile-media/g')
  })
})

describe('StyledName', () => {
  const STYLE = { font: 'pixel', effect: 'none', colors: [] }
  const name = (serverId: string | null): string =>
    renderToStaticMarkup(
      <ProfileScope serverId={serverId}>
        <StyledName name="Ana" userId="u1" style={null} />
      </ProfileScope>
    )

  it('sem estilo do servidor, apelido (style null) continua sem estilo', () => {
    expect(name('s1')).toBe(renderToStaticMarkup(<StyledName name="Ana" style={null} />))
  })

  it('o estilo do servidor vale até no apelido, só naquele servidor', () => {
    const plain = name('s1')
    seed({ s1: { u1: { name_style: STYLE } } })
    expect(name('s1')).not.toBe(plain)
    expect(name('s2')).toBe(plain)
    expect(name(null)).toBe(plain)
  })
})
