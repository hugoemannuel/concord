import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  draft: null as unknown,
  server: { id: 's1', name: 'Salinha', icon_url: '' } as unknown,
  memberGames: [] as unknown[]
}))

vi.mock('../../../shared/lib/config', () => ({ IS_WEB: true, API_BASE_URL: '/api' }))
vi.mock('../hooks/useProfileDraft', () => ({ useProfileDraft: () => state.draft }))
vi.mock('../hooks/useMemberGames', () => ({ useMemberGames: () => state.memberGames }))
vi.mock('../../servers/store/serverStore', () => ({
  useServerStore: (select: (s: unknown) => unknown) =>
    select({ currentServer: state.server, updateServer: vi.fn(), setServerIcon: vi.fn() })
}))
vi.mock('../../auth/store/authStore', () => ({
  useAuthStore: (select: (s: unknown) => unknown) => select({ user: { id: 'u', display_name: 'Ana' } })
}))
vi.mock('../../servers/components/ServerIconPicker', () => ({ default: () => null }))
vi.mock('../../../shared/ui/Avatar', () => ({ default: () => null }))
vi.mock('../../emojis/components/EmojiPickerGrid', () => ({ default: () => null }))

import { renderToStaticMarkup } from 'react-dom/server'
import type { ServerCard, ServerProfile, ServerTag } from '../api/serverProfile'
import { draftFromProfile, overlayDraft } from '../lib/profileDraft'
import { useServerCardStore } from '../store/serverCardStore'
import ArtPicker from './ArtPicker'
import GamesField from './GamesField'
import LookSection from './LookSection'
import { MyTagList } from './MyServerTagPicker'
import ProfileSection from './ProfileSection'
import ServerCardView, { LockedServerCard } from './ServerCardView'
import { ServerTagChip } from './ServerTagChip'
import TagSection from './TagSection'
import TraitsField from './TraitsField'

const tag: ServerTag = { server_id: 's1', name: 'ABC', badge: 'raio', color: '#112233' }
const profile: ServerProfile = {
  banner: { preset: 'azul', image: '' },
  traits: [{ emoji: '🎮', text: 'jogos' }],
  description: 'Um cantinho',
  games: [{ name: 'Dota 2' }],
  private: false,
  strip: { preset: '', image: '' },
  theme: { starter: '', image: '', dim: 50 },
  tag
}
const card: ServerCard = {
  server_id: 's1',
  locked: false,
  name: 'Salinha',
  created_at: '2026-03-15T12:00:00Z',
  member_count: 5,
  online_count: 2,
  is_member: true,
  profile
}

function formState(next: ServerProfile = profile, dirty = false): unknown {
  const draft = draftFromProfile(next)
  const preview = { ...card, profile: overlayDraft(next, draft, 's1') }
  return { card: { ...card, profile: next }, draft, preview, dirty, saving: false, change: vi.fn(), reset: vi.fn(), save: vi.fn() }
}

const LOADING = { card: null, draft: null, preview: null, dirty: false, saving: false }

beforeEach(() => {
  state.draft = formState()
  state.server = { id: 's1', name: 'Salinha', icon_url: '' }
  state.memberGames = []
})

describe('ServerCardView', () => {
  it('mostra o perfil, as contagens e a data', () => {
    const html = renderToStaticMarkup(<ServerCardView card={card} />)
    for (const text of ['Salinha', '2 online', '5 membros', 'Criado em mar. de 2026', 'Um cantinho', 'jogos', 'Dota 2', 'ABC']) {
      expect(html).toContain(text)
    }
  })

  it('o ícone do servidor ou a inicial', () => {
    expect(renderToStaticMarkup(<ServerCardView card={{ ...card, icon_url: '/api/x' }} />)).toContain('<img')
    expect(renderToStaticMarkup(<ServerCardView card={{ ...card, name: undefined }} />)).toContain('?')
  })

  it('campos vazios não aparecem', () => {
    const bare = { ...profile, description: '', traits: [], games: [], tag: null }
    const html = renderToStaticMarkup(<ServerCardView card={{ ...card, created_at: undefined, profile: bare }} />)
    expect(html).not.toContain('Traços do servidor')
    expect(html).not.toContain('Jogos em destaque')
    expect(html).not.toContain('Criado em')
  })

  it('trancado: só "Servidor privado", sem nada do servidor', () => {
    const html = renderToStaticMarkup(<ServerCardView card={{ ...card, locked: true }} />)
    expect(html).toContain('Servidor privado')
    expect(html).not.toContain('Salinha')
    expect(html).not.toContain('membros')
    expect(renderToStaticMarkup(<LockedServerCard />)).toContain('limitou quem pode ver')
  })

  it('sem perfil também não mostra nada', () => {
    expect(renderToStaticMarkup(<ServerCardView card={{ ...card, profile: undefined }} />)).toContain('Servidor privado')
  })
})

describe('ServerTagChip', () => {
  it('abre o cartão do servidor sem abrir o perfil da linha', () => {
    const el = ServerTagChip({ tag })
    expect(el.props['aria-label']).toContain('ABC')
    const stopPropagation = vi.fn()
    el.props.onClick({ stopPropagation })
    expect(stopPropagation).toHaveBeenCalled()
    expect(useServerCardStore.getState().serverId).toBe('s1')
    useServerCardStore.getState().close()
    expect(useServerCardStore.getState().serverId).toBeNull()
  })
})

describe('ArtPicker', () => {
  it('marca o degradê escolhido', () => {
    const html = renderToStaticMarkup(
      <ArtPicker serverId="s1" label="Banner" value={{ preset: 'azul', image: '' }} onChange={vi.fn()} />
    )
    expect(html).toContain('aria-label="Azul"')
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(html).toContain('Enviar imagem')
    expect(html).not.toContain('Remover imagem')
  })

  it('com imagem: nenhum degradê marcado e dá para trocar ou remover', () => {
    const html = renderToStaticMarkup(
      <ArtPicker serverId="s1" label="Banner" value={{ preset: 'azul', image: '/api/server-profile-images/x' }} onChange={vi.fn()} />
    )
    expect(html).not.toContain('aria-pressed="true"')
    expect(html).toContain('Trocar imagem')
    expect(html).toContain('Remover imagem')
  })
})

describe('TraitsField', () => {
  it('um campo por traço, com o emoji escolhido ou o ícone', () => {
    const html = renderToStaticMarkup(
      <TraitsField traits={[{ emoji: '🎮', text: 'jogos' }, { emoji: '', text: '' }]} onChange={vi.fn()} />
    )
    expect(html).toContain('🎮')
    expect(html).toContain('value="jogos"')
    expect(html).toContain('Texto do traço 2')
  })
})

describe('GamesField', () => {
  it('sem nada escolhido nem jogado, só a busca', () => {
    const html = renderToStaticMarkup(<GamesField serverId="s1" selected={[]} onChange={vi.fn()} />)
    expect(html).toContain('Buscar um jogo')
    expect(html).not.toContain('Em destaque')
    expect(html).not.toContain('Seus membros jogam')
  })

  it('os escolhidos e o que os membros jogam, sem dizer quem', () => {
    state.memberGames = [{ name: 'Hades', app_id: 1 }, { name: 'VALORANT' }]
    const html = renderToStaticMarkup(<GamesField serverId="s1" selected={[{ name: 'VALORANT' }]} onChange={vi.fn()} />)
    expect(html).toContain('Em destaque')
    expect(html).toContain('Seus membros jogam')
    expect(html).toContain('Hades')
    expect(html).toContain('aria-pressed="true"')
  })
})

describe('MyTagList', () => {
  const option = { ...tag, server_name: 'Salinha', server_icon_url: '/api/i' }
  it('sem servidores com tag, avisa', () => {
    const html = renderToStaticMarkup(<MyTagList options={[]} current={null} busy={false} onChoose={vi.fn()} />)
    expect(html).toContain('Nenhum dos seus servidores tem tag')
  })

  it('marca a tag em uso; clicar nela tira', () => {
    const html = renderToStaticMarkup(<MyTagList options={[option]} current={tag} busy={false} onChoose={vi.fn()} />)
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('<img')
    const none = renderToStaticMarkup(
      <MyTagList options={[{ ...option, server_icon_url: null }]} current={null} busy onChoose={vi.fn()} />
    )
    expect(none).toContain('aria-pressed="false"')
    expect(none).toContain('disabled')
  })
})

describe('seções das configurações', () => {
  it('carregando', () => {
    state.draft = LOADING
    for (const Section of [ProfileSection, TagSection, LookSection]) {
      expect(renderToStaticMarkup(<Section />)).toContain('Carregando')
    }
    state.server = null
    for (const Section of [ProfileSection, TagSection, LookSection]) {
      expect(renderToStaticMarkup(<Section />)).toContain('Carregando')
    }
  })

  it('perfil: os campos, a prévia e, sem mudanças, sem a barra', () => {
    const html = renderToStaticMarkup(<ProfileSection />)
    for (const text of ['Nome do servidor', 'Banner', 'Traços', 'Descrição', 'Jogos', 'Perfil privado', 'Como aparece para os outros']) {
      expect(html).toContain(text)
    }
    expect(html).not.toContain('alterações não salvas')
    expect(html).not.toContain('limitou quem pode ver')
  })

  it('perfil: com mudanças, a barra; privado, como quem está fora vê', () => {
    state.draft = formState({ ...profile, private: true }, true)
    const html = renderToStaticMarkup(<ProfileSection />)
    expect(html).toContain('Você tem alterações não salvas')
    expect(html).toContain('Redefinir')
    expect(html).toContain('Salvar')
    expect(html).toContain('limitou quem pode ver')
  })

  it('tag: nome, emblema, cor e a prévia no chat', () => {
    const html = renderToStaticMarkup(<TagSection />)
    for (const text of ['Nome da tag', 'Emblema', 'Cor', 'Remover tag', 'Como aparece nas mensagens', 'ABC']) {
      expect(html).toContain(text)
    }
    expect(html).not.toContain('role="alert"')
  })

  it('tag: avisa que trocar o nome obriga a reaplicar e do perfil privado', () => {
    const next = formState({ ...profile, private: true }, true) as { draft: { tag: { name: string } } }
    next.draft.tag.name = 'XYZ'
    state.draft = next
    const html = renderToStaticMarkup(<TagSection />)
    expect(html).toContain('role="alert"')
    expect(html).toContain('cada um precisa')
    expect(html).toContain('apenas “Servidor privado”')
    expect(html).toContain('alterações não salvas')
  })

  it('tag: servidor sem tag não oferece remover', () => {
    state.draft = formState({ ...profile, tag: null })
    const html = renderToStaticMarkup(<TagSection />)
    expect(html).not.toContain('Remover tag')
    expect(html).toContain('sem tag')
  })

  it('faixa e fundo: pontos de partida e, com imagem, o escurecimento', () => {
    let html = renderToStaticMarkup(<LookSection />)
    expect(html).toContain('Faixa')
    expect(html).toContain('Nenhum')
    expect(html).toContain('Oceano')
    expect(html).not.toContain('Escurecer')
    state.draft = formState(
      { ...profile, strip: { preset: 'roxo', image: '' }, theme: { starter: 'oceano', image: '/api/server-profile-images/x', dim: 70 } },
      true
    )
    html = renderToStaticMarkup(<LookSection />)
    expect(html).toContain('Escurecer a imagem: 70%')
    expect(html).toContain('Remover imagem')
    expect(html).toContain('alterações não salvas')
  })
})
