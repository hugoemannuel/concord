import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ServerEvent } from '../api/events'

vi.mock('../hooks/useBannerSrc', () => ({ useBannerSrc: () => ({ src: null, onError: () => {} }) }))
vi.mock('../api/events', async (original) => ({
  ...(await original<typeof import('../api/events')>()),
  fetchGoing: () => Promise.resolve([])
}))

// O selo "Jogando" lê a atividade dos stores de presença/chat, que puxam o áudio da chamada.
vi.mock('../../activity/store/presenceActivityStore', () => ({
  usePresenceActivityStore: (select: (s: { byUser: Record<string, never> }) => unknown) => select({ byUser: {} })
}))
vi.mock('../../chat/store/chatStore', () => ({
  useChatStore: { getState: () => ({ fetchPresenceFor: () => Promise.resolve() }) }
}))

import EventsPanelBody from './EventsPanelBody'

function ev(id: string, extra: Partial<ServerEvent> = {}): ServerEvent {
  return {
    id,
    server_id: 's1',
    duration_minutes: 120,
    game_name: null,
    voice_channel_id: null,
    text_channel_id: null,
    title: `Evento ${id}`,
    description: 'Traga a galera',
    banner_id: null,
    starts_at: '2026-12-01T20:00:00.000Z',
    next_start_at: '2026-12-01T20:00:00.000Z',
    recurrence: 'weekly',
    recurrence_until: null,
    recurrence_count: null,
    reminder_offsets: [10, 5],
    created_by: 'u1',
    going_count: 3,
    my_rsvp: null,
    ...extra
  }
}

const channels = [{ id: 'voz', name: 'evento-noite-de-jogos' }]

function render(props: Partial<React.ComponentProps<typeof EventsPanelBody>> = {}): string {
  return renderToStaticMarkup(
    <EventsPanelBody
      serverId="s1"
      events={[ev('a'), ev('b')]}
      error={null}
      canCreate={false}
      canEdit={false}
      canDelete={false}
      channels={channels}
      selectedId={null}
      onSelect={() => {}}
      onCreate={() => {}}
      onEdit={() => {}}
      onRetry={() => {}}
      onRespond={() => {}}
      onCancelEvent={() => {}}
      {...props}
    />
  )
}

describe('EventsPanelBody', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { body: {} })
  })

  it('lista os eventos com título e quantos vão', () => {
    const html = render()
    expect(html).toContain('Evento a')
    expect(html).toContain('Evento b')
    expect(html).toContain('3 vão')
  })

  it('o botão Criar evento só aparece para quem pode criar', () => {
    expect(render({ canCreate: false })).not.toContain('Criar evento')
    expect(render({ canCreate: true })).toContain('Criar evento')
  })

  it('sem eventos, mostra o estado vazio', () => {
    expect(render({ events: [] })).toContain('Nenhum evento marcado')
  })

  it('carregando (lista ainda indefinida), mostra o aviso de carregamento', () => {
    expect(render({ events: undefined })).toContain('Carregando eventos…')
  })

  it('com erro, mostra a mensagem e o botão para tentar de novo', () => {
    const html = render({ events: undefined, error: 'Não foi possível carregar os eventos.' })
    expect(html).toContain('Não foi possível carregar os eventos.')
    expect(html).toContain('Tentar de novo')
  })

  it('o cartão da lista mostra o jogo do evento, e só quando há', () => {
    const withGame = render({ events: [ev('a', { game_name: 'Minecraft' })] })
    expect(withGame).toContain('Minecraft')
    expect(withGame).toContain('Jogo: ')
    expect(render({ events: [ev('a')] })).not.toContain('Jogo')
  })

  it('o detalhe mostra o jogo do evento, e só quando há', () => {
    const withGame = render({ events: [ev('a', { game_name: 'Valorant' })], selectedId: 'a' })
    expect(withGame.match(/Valorant/g)?.length).toBeGreaterThanOrEqual(2)
    expect(render({ selectedId: 'a' })).not.toContain('Jogo')
  })

  it('evento selecionado abre o detalhe com a descrição, a duração e a repetição', () => {
    const html = render({ selectedId: 'a' })
    expect(html).toContain('Traga a galera')
    expect(html).toContain('Dura 2 horas')
    expect(html).toMatch(/Toda (segunda|terça|quarta|quinta|sexta)-feira|Todo (sábado|domingo)/)
  })

  it('antes de começar, o detalhe explica que a sala abre na hora e é só de quem confirmou', () => {
    const html = render({ selectedId: 'a' })
    expect(html).toContain('A sala abre na hora de começar')
    expect(html).toContain('só entra quem confirmou presença')
  })

  it('com a sala aberta, o detalhe mostra o canal de voz do evento', () => {
    const html = render({ events: [ev('a', { voice_channel_id: 'voz' })], selectedId: 'a' })
    expect(html).toContain('Sala aberta: #evento-noite-de-jogos')
  })

  it('sala aberta cujo canal não está na lista (sem acesso) não quebra', () => {
    const html = render({ events: [ev('a', { voice_channel_id: 'outro' })], selectedId: 'a' })
    expect(html).toContain('Sala aberta')
  })

  it('Editar e Cancelar evento aparecem cada um para quem tem aquela ação', () => {
    const none = render({ selectedId: 'a' })
    expect(none).not.toContain('Editar')
    expect(none).not.toContain('Cancelar evento')

    const editOnly = render({ selectedId: 'a', canEdit: true })
    expect(editOnly).toContain('Editar')
    expect(editOnly).not.toContain('Cancelar evento')

    const deleteOnly = render({ selectedId: 'a', canDelete: true })
    expect(deleteOnly).not.toContain('Editar')
    expect(deleteOnly).toContain('Cancelar evento')

    const both = render({ selectedId: 'a', canEdit: true, canDelete: true })
    expect(both).toContain('Editar')
    expect(both).toContain('Cancelar evento')
  })

  it('quem só cria não vê Editar nem Cancelar no detalhe', () => {
    const html = render({ selectedId: 'a', canCreate: true })
    expect(html).not.toContain('Editar')
    expect(html).not.toContain('Cancelar evento')
  })

  it('o evento marcado mostra a minha resposta na lista e no detalhe', () => {
    const html = render({ events: [ev('a', { my_rsvp: true })], selectedId: 'a' })
    expect(html).toContain('aria-pressed="true"')
  })

  it('em tela pequena, a lista some quando há detalhe aberto (e vice-versa)', () => {
    expect(render({ selectedId: 'a' })).toContain('hidden xl:flex')
    expect(render({ selectedId: null })).toContain('hidden xl:flex')
  })
})
