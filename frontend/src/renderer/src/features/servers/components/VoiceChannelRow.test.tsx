import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

// O callStore de verdade puxa o áudio (AudioWorklet) que não existe no vitest.
const call = vi.hoisted(() => ({ state: {} as Record<string, unknown> }))
vi.mock('../../call/store/callStore', () => ({
  useCallStore: Object.assign((sel: (s: unknown) => unknown) => sel(call.state), {
    getState: () => call.state
  })
}))

// Puxa a atividade da chamada (e com ela o áudio); aqui basta um selo vazio.
vi.mock('../../call/components/CallActivityBadge', () => ({
  default: () => <span data-atividade="" />
}))

vi.mock('../../activity/components/ActivityLine', () => ({ GameBadge: () => null }))
// O "Assistir" da prévia do selo LIVE abre a chamada pelo router (o app inteiro).
vi.mock('../../call/store/streamJoinStore', () => ({ requestWatchStream: vi.fn() }))

// A janela de convidar amigos puxa lista de amigos e presença; aqui só importa o botão.
vi.mock('../../call/components/InviteFriendsModal', () => ({ default: () => null }))

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

import type { Channel } from '../api/channels'
import type { CallParticipant } from '../../call/api/calls'
import type { ServerAccess } from '../lib/serverAccess'
import { Perm } from '../lib/permissions'
import { useAuthStore } from '../../auth/store/authStore'
import { useMusicStore } from '../../music/store/musicStore'
import { useServerStore } from '../store/serverStore'
import VoiceChannelRow, { type VoiceChannelRowProps } from './VoiceChannelRow'

const channel: Channel = {
  id: 'v1',
  server_id: 's1',
  name: 'papo-de-voz',
  type: 'voice',
  created_by: 'dono',
  created_at: '',
  updated_at: ''
}

function fakeAccess(perms: number, opts: { isPrivate?: boolean } = {}): ServerAccess {
  return {
    isOwner: false,
    perms,
    highest: 0,
    myRoles: [],
    can: (want) => (perms & want) === want,
    channelPerms: () => perms,
    canInChannel: (_id, want) => (perms & want) === want,
    highestOf: () => 0,
    canActOnMember: () => true,
    canEditRolesOf: () => true,
    canChangeNickname: () => false,
    canDisconnectMember: () => true,
    canMoveMember: () => true,
    canManage: () => false,
    isPrivate: () => Boolean(opts.isPrivate)
  }
}

const participant = (user_id: string, extra: Partial<CallParticipant> = {}): CallParticipant => ({
  call_id: 'c1',
  user_id,
  role: 'member',
  joined_at: '2026-01-01T00:00:00Z',
  username: user_id,
  display_name: user_id.toUpperCase(),
  ...extra
})

function setCall(patch: Record<string, unknown>): void {
  call.state = { ...call.state, ...patch }
}

function render(props: Partial<VoiceChannelRowProps> = {}): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <VoiceChannelRow
        channel={channel}
        access={fakeAccess(Perm.VIEW_CHANNEL | Perm.CONNECT)}
        onJoin={() => {}}
        {...props}
      />
    </MemoryRouter>
  )
}

function inCall(participants: CallParticipant[], call: { locked?: boolean } = {}): void {
  setCall({
    serverCalls: {
      v1: {
        call: {
          id: 'c1',
          type: 'channel',
          channel_id: 'v1',
          initiator_id: 'ana',
          status: 'active',
          started_at: '2026-01-01T00:00:00Z',
          ...call
        },
        participants
      }
    }
  })
}

describe('VoiceChannelRow', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { id: 'eu', username: 'eu', display_name: 'Eu' } as never })
    useServerStore.setState({ currentServer: { id: 's1' } as never, currentMembers: [] })
    call.state = {
      cancelJoinRequest: () => {},
      muted: false,
      deafened: false
    }
    setCall({
      serverCalls: {},
      status: 'idle',
      type: null,
      channelId: null,
      knock: null,
      speakingIds: [],
      screenSharers: []
    })
    useMusicStore.setState({ presence: {} })
    chat.state = { unreadByRoom: {}, mentionsByRoom: {} }
  })

  it('canal vazio: só o nome e o convite para conectar', () => {
    const html = render()
    expect(html).toContain('papo-de-voz')
    expect(html).toContain('title="Conectar ao canal de voz"')
    expect(html).toContain('pr-7 sm:pr-7')
    expect(html).not.toContain('(restrito)')
    expect(html).not.toContain('mb-1 ml-4')
  })

  it('sem permissão de entrar: cadeado de restrito e botão apagado', () => {
    const html = render({ access: fakeAccess(Perm.VIEW_CHANNEL) })
    expect(html).toContain('Sem permissão para entrar')
    expect(html).toContain('opacity-60')
  })

  it('canal privado mostra o cadeado de privado', () => {
    const html = render({
      access: fakeAccess(Perm.VIEW_CHANNEL | Perm.CONNECT, { isPrivate: true })
    })
    expect(html).toContain('title="Canal privado"')
  })

  it('com gente: contagem, tempo, pessoas e o "•••" que troca com a contagem', () => {
    inCall([participant('ana'), participant('eu', { muted: true })])
    setCall({ status: 'active', type: 'channel', channelId: 'v1', muted: false })
    const html = render({
      access: fakeAccess(Perm.VIEW_CHANNEL | Perm.CONNECT | Perm.MOVE_MEMBERS),
      renderMenuButton: (onHover) => <span data-menu={onHover ? 'hover' : 'fixo'} />,
      menu: <div data-menu-aberto="" />
    })
    expect(html).toContain('title="Desconectar"')
    expect(html).toContain('ANA')
    expect(html).toContain('EU')
    expect(html).toContain('data-menu="hover"')
    expect(html).toContain('data-menu-aberto')
    expect(html).toContain('group-hover/voicech:opacity-0')
    expect(html).toContain('text-success')
    expect(html).toContain('Arraste para outro canal de voz')
  })

  it('membro de mesma hierarquia pode ser arrastado se tiver permissão de mover', () => {
    inCall([participant('colega')])
    setCall({ status: 'active', type: 'channel', channelId: 'v1' })
    const access = fakeAccess(Perm.VIEW_CHANNEL | Perm.CONNECT | Perm.MOVE_MEMBERS)
    access.canActOnMember = () => false
    access.canMoveMember = () => true
    const html = render({ access })
    expect(html).toContain('COLEGA')
    expect(html).toContain('Arraste para outro canal de voz')
  })

  it('membro de hierarquia superior não pode ser arrastado', () => {
    inCall([participant('superior')])
    setCall({ status: 'active', type: 'channel', channelId: 'v1' })
    const access = fakeAccess(Perm.VIEW_CHANNEL | Perm.CONNECT | Perm.MOVE_MEMBERS)
    access.canActOnMember = () => false
    access.canMoveMember = () => false
    const html = render({ access })
    expect(html).toContain('SUPERIOR')
    expect(html).not.toContain('Arraste para outro canal de voz')
  })

  describe('Convidar amigos na linha do canal', () => {
    const connected = { status: 'active', type: 'channel', channelId: 'v1', callId: 'c1' }

    it('conectado: botão entre o balão e o "•••", com nome acessível e espaço reservado', () => {
      inCall([participant('eu')])
      setCall(connected)
      const html = render({ renderMenuButton: () => <span data-menu="" /> })
      expect(html).toContain('aria-label="Convidar para a call"')
      expect(html).toContain('right-14')
      expect(html).toContain('pr-20 sm:pr-2.5')
      // O balão do chat continua ali, ao lado.
      expect(html).toContain('aria-label="Abrir chat"')
    })

    it('sem o "•••" o botão chega mais perto da borda', () => {
      inCall([participant('eu')])
      setCall(connected)
      const html = render()
      expect(html).toContain('right-[34px]')
      expect(html).toContain('pr-14 sm:pr-2.5')
    })

    it('fora do canal (ou em outro canal) não aparece', () => {
      inCall([participant('ana')])
      expect(render()).not.toContain('Convidar para a call')
      setCall({ ...connected, channelId: 'v2' })
      expect(render()).not.toContain('Convidar para a call')
    })
  })

  it('sala trancada, eu fora: pedir permissão', () => {
    inCall([participant('ana')], { locked: true })
    const html = render()
    expect(html).toContain('(trancada)')
    expect(html).toContain('Sala trancada · Pedir permissão')
  })

  it('sala trancada: pedido enviado e pedido recusado', () => {
    inCall([participant('ana')], { locked: true })
    setCall({ knock: { channelId: 'v1', callId: 'c1', status: 'pending' } })
    const pending = render()
    expect(pending).toContain('Pedido enviado…')
    // O "Cancelar pedido" fica no canto do balão do chat: ele sai enquanto isso.
    expect(pending).not.toContain('Abrir chat')
    setCall({ knock: { channelId: 'v1', callId: 'c1', status: 'declined' } })
    expect(render()).toContain('Pedido recusado')
  })

  it('o Maestro aparece como mais alguém no canal', () => {
    useMusicStore.setState({ presence: { s1: ['v1'] } })
    expect(render()).toContain('data-maestro-tile')
  })

  it('balão "Abrir chat": sempre no toque, no hover do sm em diante', () => {
    const html = render()
    expect(html).toContain('aria-label="Abrir chat"')
    expect(html).toContain('sm:opacity-0 sm:group-hover/voicech:opacity-100')
    expect(html).toContain('right-1.5')
    // No toque, a área de clique cresce para 40×40 (o desenho continua 20 px).
    expect(html).toContain('pointer-coarse:before:-inset-y-2.5 pointer-coarse:before:-left-5')
    expect(html).toContain('h-5 w-5')
  })

  it('com o "•••", o balão fica à esquerda dele', () => {
    const html = render({ renderMenuButton: () => <span data-menu="" /> })
    expect(html).toContain('right-7')
    expect(html).toContain('pr-12 sm:pr-12')
  })

  it('não lidas do chat do canal aparecem na linha; menção ganha', () => {
    chat.state = { unreadByRoom: { 'channel:v1': 3 }, mentionsByRoom: {} }
    expect(render()).toContain('title="Mensagens não lidas no chat"')
    chat.state = { unreadByRoom: { 'channel:v1': 3 }, mentionsByRoom: { 'channel:v1': 1 } }
    const html = render()
    expect(html).toContain('title="Menções no chat"')
    expect(html).toContain('>1</span>')
  })
})
