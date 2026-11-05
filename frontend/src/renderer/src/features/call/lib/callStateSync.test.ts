import { describe, expect, it } from 'vitest'
import type { CallStateResponse } from '../api/calls'
import { staleOwnLive, syncCallState, type LocalCallState } from './callStateSync'

const user = (
  id: string
): { id: string; username: string; display_name: string; avatar_url: null } => ({
  id,
  username: id,
  display_name: id,
  avatar_url: null
})

const local = (over: Partial<LocalCallState> = {}): LocalCallState => ({
  type: 'channel',
  locked: false,
  participants: [],
  joinRequests: [],
  voiceStates: {},
  screenWatchers: {},
  isScreenSharing: false,
  ...over
})

const server = (over: Partial<CallStateResponse> = {}): CallStateResponse => ({
  call: null,
  participants: [
    { call_id: 'c', user_id: 'eu', role: 'member', joined_at: '' },
    {
      call_id: 'c',
      user_id: 'ana',
      role: 'member',
      joined_at: '',
      username: 'ana',
      muted: true
    }
  ],
  ...over
})

describe('syncCallState', () => {
  it('preserva a moldura e a faixa dos participantes', () => {
    const s = server({
      participants: [
        {
          call_id: 'c1',
          user_id: 'bia',
          role: 'member',
          joined_at: '2026-01-01',
          avatar_decoration_url: '/api/profile-media/dec',
          nameplate_url: '/api/profile-media/plate'
        }
      ]
    })
    const synced = syncCallState(s, 'eu', local(), true)
    expect(synced.participants[0].avatar_decoration_url).toBe('/api/profile-media/dec')
    expect(synced.participants[0].nameplate_url).toBe('/api/profile-media/plate')
  })

  it('lista os outros participantes, sem mim, com nome de reserva', () => {
    const synced = syncCallState(server(), 'eu', local(), true)
    expect(synced.participants).toEqual([
      { id: 'ana', username: 'ana', display_name: 'ana', avatar_url: null, avatar_decoration_url: null, nameplate_url: null, name_style: undefined }
    ])
    expect(synced.voiceStates.ana).toEqual({
      muted: true,
      deafened: false,
      serverMuted: false,
      serverDeafened: false
    })
  })

  it('sem replace, só soma quem faltava e mantém o mudo que já chegou por evento', () => {
    const bia = user('bia')
    const synced = syncCallState(
      server({ join_requests: [user('caio')] }),
      'eu',
      local({
        participants: [bia],
        joinRequests: [user('caio')],
        voiceStates: { ana: { muted: false, deafened: true } }
      }),
      false
    )
    expect(synced.participants.map((p) => p.id)).toEqual(['bia', 'ana'])
    expect(synced.joinRequests.map((p) => p.id)).toEqual(['caio'])
    expect(synced.voiceStates.ana).toEqual({ muted: false, deafened: true })
  })

  it('com replace, o servidor vale no canal; na DM a lista não encolhe', () => {
    const bia = user('bia')
    expect(
      syncCallState(server(), 'eu', local({ participants: [bia] }), true).participants.map(
        (p) => p.id
      )
    ).toEqual(['ana'])
    expect(
      syncCallState(
        server(),
        'eu',
        local({ type: 'dm', participants: [bia] }),
        true
      ).participants.map((p) => p.id)
    ).toEqual(['bia', 'ana'])
  })

  it('trava, telas e espectadores vêm do servidor, com o local de reserva', () => {
    const watchers = { ana: [user('bia')] }
    const synced = syncCallState(
      server({ screen_sharing: ['ana'], screen_watchers: watchers }),
      'eu',
      local({ locked: true }),
      true
    )
    expect(synced).toMatchObject({ locked: true, screenSharers: ['ana'], screenWatchers: watchers })
    expect(syncCallState(server(), 'eu', local({ screenWatchers: watchers }), true)).toMatchObject({
      screenSharers: [],
      screenWatchers: watchers
    })
  })

  it('a live que o servidor guardou de outra sessão sai da lista (#367)', () => {
    const ghost = server({ screen_sharing: ['eu', 'ana'] })
    expect(syncCallState(ghost, 'eu', local(), false).screenSharers).toEqual(['ana'])
    expect(staleOwnLive(ghost, 'eu', false)).toBe(true)
  })

  it('transmitindo, continuo na lista mesmo que o servidor ainda não saiba', () => {
    const synced = syncCallState(
      server({ screen_sharing: ['ana'] }),
      'eu',
      local({ isScreenSharing: true }),
      true
    )
    expect(synced.screenSharers).toEqual(['ana', 'eu'])
    expect(staleOwnLive(server({ screen_sharing: ['eu'] }), 'eu', true)).toBe(false)
    expect(staleOwnLive(server(), 'eu', false)).toBe(false)
  })
})
