import { describe, expect, it } from 'vitest'
import type { MessageFavorite } from '../api/messageFavorites'
import type { Message } from '../../chat/api/messages'
import { favoriteDestination, favoriteOrigin } from './favoriteTarget'

const msg = (over: Partial<Message>): Message =>
  ({ id: 'm1', author_id: 'u1', content: 'oi', created_at: '2026-11-09T12:00:00Z', ...over }) as Message

const channelFav: MessageFavorite = {
  message_id: 'm1',
  favorited_at: '2026-11-09T12:00:00Z',
  message: msg({ channel_id: 'c1' }),
  origin: { server_id: 's1', server_name: 'Salinha', channel_name: 'geral' }
}

const dmFav: MessageFavorite = {
  message_id: 'm2',
  favorited_at: '2026-11-09T12:00:00Z',
  message: msg({ id: 'm2', conversation_id: 'cv1' }),
  origin: {
    conversation_type: 'dm',
    dm_user: { id: 'u2', username: 'bia', display_name: 'Bia' }
  }
}

const groupFav: MessageFavorite = {
  message_id: 'm3',
  favorited_at: '2026-11-09T12:00:00Z',
  message: msg({ id: 'm3', conversation_id: 'cv2' }),
  origin: { conversation_type: 'group', conversation_name: '' }
}

describe('favoriteDestination', () => {
  it('canal abre o canal do servidor e pula na sala do canal', () => {
    expect(favoriteDestination(channelFav)).toEqual({
      path: '/servers/s1/channels/c1',
      room: 'channel:c1'
    })
  })

  it('DM 1:1 abre pela outra pessoa', () => {
    expect(favoriteDestination(dmFav)).toEqual({ path: '/dm/u2', room: 'conversation:cv1' })
  })

  it('grupo abre pela conversa', () => {
    expect(favoriteDestination(groupFav)).toEqual({ path: '/dm/c/cv2', room: 'conversation:cv2' })
  })

  it('indisponível não abre', () => {
    expect(
      favoriteDestination({ message_id: 'm9', favorited_at: '', unavailable: true })
    ).toBeNull()
  })

  it('canal sem servidor na origem não abre', () => {
    expect(favoriteDestination({ ...channelFav, origin: {} })).toBeNull()
  })
})

describe('favoriteOrigin', () => {
  it('canal: nome do canal e do servidor', () => {
    expect(favoriteOrigin(channelFav)).toEqual({ kind: 'channel', title: 'geral', detail: 'Salinha' })
  })

  it('DM: nome de quem está do outro lado', () => {
    expect(favoriteOrigin(dmFav)).toEqual({ kind: 'dm', title: 'Bia' })
  })

  it('grupo sem nome vira "Grupo"', () => {
    expect(favoriteOrigin(groupFav)).toEqual({ kind: 'group', title: 'Grupo' })
  })
})
