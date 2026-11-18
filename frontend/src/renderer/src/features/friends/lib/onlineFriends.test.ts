import { describe, expect, it } from 'vitest'
import type { PublicUser } from '../../auth/store/authStore'
import type { CallStateResponse } from '../../call/api/calls'
import { friendsInVoice, onlineFriends } from './onlineFriends'

const u = (id: string): PublicUser => ({ id, username: id }) as PublicUser
const [a, b, c] = [u('a'), u('b'), u('c')]

describe('onlineFriends', () => {
  it('exige presença e ignora quem está offline', () => {
    const presence = { a: true, b: true }
    const statuses = { b: 'offline' }
    expect(onlineFriends([a, b, c], presence, statuses)).toEqual([a])
  })
  it('status ausente conta como online', () => {
    expect(onlineFriends([a], { a: true }, {})).toEqual([a])
  })
})

describe('friendsInVoice', () => {
  const call = (server_id: string | null, channel_id: string | null, ids: string[]) =>
    ({
      call: { server_id, channel_id },
      participants: ids.map((id) => ({ user_id: id, display_name: id.toUpperCase() }))
    }) as unknown as CallStateResponse

  it('devolve servidor, canal e quem está na call', () => {
    const calls = {
      ch1: {
        call: { server_id: 's1', channel_id: 'ch1' },
        participants: [
          { user_id: 'a', display_name: 'Ana' },
          { user_id: 'x', username: 'xis' }
        ]
      } as unknown as CallStateResponse
    }
    expect(friendsInVoice([a, b], calls)).toEqual([
      {
        friend: a,
        serverId: 's1',
        channelId: 'ch1',
        people: [
          { id: 'a', name: 'Ana', avatarUrl: null },
          { id: 'x', name: 'xis', avatarUrl: null }
        ]
      }
    ])
  })
  it('dois amigos no mesmo canal viram dois itens', () => {
    const items = friendsInVoice([a, c], { ch1: call('s1', 'ch1', ['a', 'c']) })
    expect(items.map((i) => [i.friend.id, i.channelId])).toEqual([
      ['a', 'ch1'],
      ['c', 'ch1']
    ])
  })
  it('amigo em dois canais aparece uma vez', () => {
    const calls = { ch1: call('s1', 'ch1', ['a']), ch2: call('s2', 'ch2', ['a']) }
    expect(friendsInVoice([a], calls)).toHaveLength(1)
  })
  it('ignora call sem server_id ou channel_id', () => {
    const calls = { x: call(null, 'ch1', ['a']), y: call('s1', null, ['a']) }
    expect(friendsInVoice([a], calls)).toEqual([])
  })
  it('sem chamadas, ninguém', () => {
    expect(friendsInVoice([a], {})).toEqual([])
  })
})
