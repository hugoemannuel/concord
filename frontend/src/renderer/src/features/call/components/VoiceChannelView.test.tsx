import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// O callStore de verdade puxa o áudio (AudioWorklet) que não existe no vitest.
const call = vi.hoisted(() => ({ state: {} as Record<string, unknown> }))
vi.mock('../store/callStore', () => ({
  useCallStore: Object.assign((sel: (s: unknown) => unknown) => sel(call.state), {
    getState: () => call.state
  })
}))
// Peças pesadas da chamada: aqui só importa se aparecem.
vi.mock('./CallStage', () => ({ default: () => <div data-palco="" /> }))
vi.mock('./CallControlsDock', () => ({ default: () => <div data-dock="" /> }))
vi.mock('../../music/components/MusicPanel', () => ({ default: () => <div data-musica="" /> }))
vi.mock('../../music/hooks/useVoiceChannelMusic', () => ({ useVoiceChannelMusic: () => {} }))
vi.mock('./ParticipantTile', () => ({
  default: ({ user, isScreen }: { user: { display_name: string }; isScreen?: boolean }) => (
    <span data-tile={user.display_name} data-tela={isScreen ? 'sim' : 'nao'} />
  )
}))
vi.mock('../../levels/hooks/useMyBoost', () => ({ useMyBoostPercent: () => call.state.boost }))

// O chatStore de verdade puxa o resto do app (e o áudio); aqui só as contagens.
const chat = vi.hoisted(() => ({
  state: { unreadByRoom: {}, mentionsByRoom: {} } as Record<string, unknown>
}))
vi.mock('../../chat/store/chatStore', () => ({
  useChatStore: Object.assign((sel: (s: unknown) => unknown) => sel(chat.state), {
    getState: () => chat.state,
    setState: (patch: Record<string, unknown>) => (chat.state = { ...chat.state, ...patch })
  })
}))

// SSR lê o estado atual do zustand (mesmo truque do ImageContextMenu.test).
vi.spyOn(React, 'useSyncExternalStore').mockImplementation((_subscribe, getSnapshot) =>
  getSnapshot()
)

import { useMusicStore } from '../../music/store/musicStore'
import { useChatStore } from '../../chat/store/chatStore'
import { useVoiceChatPanelStore } from '../../chat/store/voiceChatPanelStore'
import { useServerStore } from '../../servers/store/serverStore'
import VoiceChannelView from './VoiceChannelView'

function render(): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/servers/s1/channels/v1']}>
      <Routes>
        <Route
          path="/servers/:id/channels/:channelId"
          element={<VoiceChannelView channelId="v1" />}
        />
      </Routes>
    </MemoryRouter>
  )
}

const participant = (user_id: string): Record<string, unknown> => ({
  call_id: 'c1',
  user_id,
  role: 'member',
  joined_at: '',
  username: user_id,
  display_name: user_id.toUpperCase()
})

describe('VoiceChannelView', () => {
  beforeEach(() => {
    call.state = {
      status: 'idle',
      type: null,
      channelId: null,
      serverCalls: {},
      speakingIds: [],
      startedAt: null,
      muted: false,
      deafened: false,
      boost: 100,
      joinVoiceChannel: () => Promise.resolve()
    }
    useServerStore.setState({ currentServer: { id: 's1' } as never, currentMembers: [] })
    useMusicStore.setState({ presence: {} })
    useVoiceChatPanelStore.setState({ channelId: null })
    useChatStore.setState({ unreadByRoom: {}, mentionsByRoom: {} })
  })

  it('canal vazio, eu fora: convida a entrar', () => {
    const html = render()
    expect(html).toContain('Ninguém aqui ainda')
    expect(html).toContain('Entrar na voz')
    expect(html).not.toContain('data-palco')
    expect(html).not.toContain('Voz conectada')
  })

  it('com gente e eu fora: mostra quem está (e quem transmite) e o botão de entrar', () => {
    call.state.serverCalls = {
      v1: {
        call: null,
        participants: [participant('ana'), participant('bia')],
        screen_sharing: ['bia']
      }
    }
    useMusicStore.setState({ presence: { s1: ['v1'] } })
    const html = render()
    expect(html).toContain('data-tile="ANA" data-tela="nao"')
    expect(html).toContain('data-tile="BIA" data-tela="sim"')
    expect(html).toContain('data-tile="Maestro"')
    expect(html).toContain('Entrar na voz')
  })

  it('conectado: palco, selo de voz conectada, música e controles', () => {
    call.state = { ...call.state, status: 'active', type: 'channel', channelId: 'v1', boost: 400 }
    const html = render()
    expect(html).toContain('data-palco')
    expect(html).toContain('Voz conectada')
    expect(html).toContain('data-musica')
    expect(html).toContain('data-dock')
    expect(html).toContain('boost-aura')
  })

  it('conectado e mudo: sem a aura do boost', () => {
    call.state = {
      ...call.state,
      status: 'active',
      type: 'channel',
      channelId: 'v1',
      boost: 400,
      muted: true
    }
    expect(render()).not.toContain('boost-aura')
  })

  it('o botão do chat aparece conectado ou não e mostra as não lidas', () => {
    useChatStore.setState({ unreadByRoom: { 'channel:v1': 4 } })
    const html = render()
    expect(html).toContain('aria-label="Abrir chat"')
    expect(html).toContain('aria-pressed="false"')
    expect(html).toContain('>4</span>')
  })

  it('com o chat deste canal aberto: botão para fechar, sem o painel (ele vai na coluna da direita do servidor)', () => {
    useVoiceChatPanelStore.setState({ channelId: 'v1' })
    useChatStore.setState({ unreadByRoom: { 'channel:v1': 4 } })
    const html = render()
    expect(html).toContain('aria-label="Fechar chat"')
    expect(html).toContain('aria-pressed="true"')
    expect(html).not.toContain('>4</span>')
    expect(html).not.toContain('aria-label="Chat de')
  })
})
