import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemberProfileView } from '../lib/memberProfile'

// O hook fala com a API (já testada em lib/); aqui entra o que a tela mostra.
const state = vi.hoisted(() => ({
  editor: {} as Record<string, unknown>
}))
vi.mock('../hooks/useMemberProfileEditor', () => ({ useMemberProfileEditor: () => state.editor }))
vi.mock('../../profile/store/meActions', () => ({ changeMyStatus: vi.fn() }))
vi.mock('../../profile/components/EntranceSoundSettings', () => ({ default: () => null }))
vi.mock('../../../shared/ui/Avatar', () => ({ default: () => <span data-avatar /> }))
// A prévia puxa o cartão inteiro (atividade, call): aqui basta o que ela recebe.
vi.mock('../../profile/components/ProfileCardBody', () => ({
  default: ({ profile }: { profile: { display_name: string; bio: string } }) => (
    <div data-preview>
      {profile.display_name} | {profile.bio}
    </div>
  )
}))
vi.mock('../../levels/components/LevelBadge', () => ({ default: () => null }))
vi.mock('../../levels/components/BadgeRow', () => ({ default: () => null }))

import MemberProfileEditor from './MemberProfileEditor'
import { effectiveUser } from '../lib/memberProfile'

const user = {
  id: 'u1',
  username: 'ana',
  display_name: 'Ana Global',
  bio: 'bio global',
  pronouns: '',
  status_text: '',
  links: [],
  status: 'online'
} as never

const viewOf = (over: Partial<MemberProfileView> = {}): MemberProfileView => ({
  server_id: 's1',
  user_id: 'u1',
  profile: {},
  has_profile: false,
  nickname: null,
  can_change_nickname: true,
  ...over
})

function open(view: MemberProfileView | null, failed = false): string {
  const shown = view ? effectiveUser(user, view) : null
  state.editor = {
    view,
    failed,
    profile: {
      user: shown,
      avatarUrl: shown?.avatar_url ?? null,
      bannerUrl: shown?.banner_url ?? null,
      saving: false,
      progress: null,
      cropping: null,
      apply: vi.fn(),
      pickFile: vi.fn(),
      closeCrop: vi.fn()
    },
    cosmetics: {},
    resetField: vi.fn(),
    resetMedia: vi.fn(),
    removeProfile: vi.fn()
  }
  return renderToStaticMarkup(<MemberProfileEditor serverId="s1" serverName="Salinha" />)
}

beforeEach(() => {
  state.editor = {}
})

describe('MemberProfileEditor', () => {
  it('sem perfil no servidor: tudo herdado e a prévia com o global', () => {
    const html = open(viewOf())
    expect(html).toContain('Ana Global | bio global')
    expect(html).toContain('Herdado')
    expect(html).not.toContain('Voltar ao padrão')
    expect(html).not.toContain('voltar ao padrão')
    expect(html).not.toContain('Apagar perfil deste servidor')
  })

  it('status e som de entrada ficam só no perfil global', () => {
    const html = open(viewOf())
    expect(html).not.toContain('Som de entrada')
    expect(html).not.toContain('Mudar status')
  })

  it('campo sobrescrito aparece na prévia, com voltar ao padrão só nele', () => {
    const html = open(viewOf({ profile: { bio: 'bio daqui' }, has_profile: true }))
    expect(html).toContain('Ana Global | bio daqui')
    expect(html).toContain('Voltar Sobre mim ao padrão')
    expect(html).not.toContain('Voltar pronomes ao padrão')
    expect(html).toContain('Apagar perfil deste servidor')
  })

  it('apelido é o nome e pode ser apagado por quem tem a permissão', () => {
    const html = open(viewOf({ nickname: 'Aninha' }))
    expect(html).toContain('Aninha | bio global')
    expect(html).toContain('Voltar nome e estilo ao padrão')
    expect(html).toContain('Apagar perfil deste servidor')
  })

  it('sem CHANGE_NICKNAME o apelido imposto fica e não há o que apagar', () => {
    const html = open(viewOf({ nickname: 'Imposto', can_change_nickname: false }))
    expect(html).toContain('Imposto | bio global')
    expect(html).not.toContain('Apagar perfil deste servidor')
    expect(html).not.toContain('Voltar nome e estilo ao padrão')
  })

  it('imagem sobrescrita tem voltar ao padrão; herdada não', () => {
    const html = open(viewOf({ profile: { avatar_url: '/s1' }, has_profile: true }))
    expect(html).toContain('Avatar: voltar ao padrão')
    expect(html).not.toContain('Banner: voltar ao padrão')
  })

  it('carregando mostra o esqueleto; falha avisa', () => {
    expect(open(null)).not.toContain('Herdado')
    expect(open(null, true)).toContain('role="alert"')
  })
})
