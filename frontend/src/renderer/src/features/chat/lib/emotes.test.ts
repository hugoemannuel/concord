import { describe, expect, it } from 'vitest'
import {
  applyReactionAdd,
  applyReactionRemove,
  clearDeletedReplyTarget,
  hasUserReacted
} from './emotes'
import type { Message } from '../api/messages'

describe('emotes & reactions helpers', () => {
  it('adiciona reação nova e agrega usuários sem duplicar', () => {
    let reactions = applyReactionAdd(undefined, '👍', 'u1')
    expect(reactions).toEqual([{ emoji: '👍', count: 1, user_ids: ['u1'] }])

    // Idempotente para o mesmo usuário
    reactions = applyReactionAdd(reactions, '👍', 'u1')
    expect(reactions).toEqual([{ emoji: '👍', count: 1, user_ids: ['u1'] }])

    // Segundo usuário no mesmo emoji
    reactions = applyReactionAdd(reactions, '👍', 'u2')
    expect(reactions).toEqual([{ emoji: '👍', count: 2, user_ids: ['u1', 'u2'] }])
    expect(hasUserReacted(reactions, '👍', 'u2')).toBe(true)
    expect(hasUserReacted(reactions, '❤️', 'u2')).toBe(false)
  })

  it('remove reação de um usuário e exclui o grupo quando zera', () => {
    let reactions = [
      { emoji: '👍', count: 2, user_ids: ['u1', 'u2'] },
      { emoji: '🔥', count: 1, user_ids: ['u1'] }
    ]

    reactions = applyReactionRemove(reactions, '👍', 'u1')
    expect(reactions).toEqual([
      { emoji: '👍', count: 1, user_ids: ['u2'] },
      { emoji: '🔥', count: 1, user_ids: ['u1'] }
    ])

    reactions = applyReactionRemove(reactions, '👍', 'u2')
    expect(reactions).toEqual([{ emoji: '🔥', count: 1, user_ids: ['u1'] }])
  })

  it('limpa reply_to quando a mensagem original é excluída', () => {
    const msgs: Message[] = [
      {
        id: 'm1',
        author_id: 'u1',
        content: 'original',
        created_at: '2026-01-01T00:00:00Z'
      },
      {
        id: 'm2',
        author_id: 'u2',
        content: 'resposta',
        reply_to_id: 'm1',
        reply_to: { id: 'm1', author_id: 'u1', content: 'original' },
        created_at: '2026-01-01T00:01:00Z'
      }
    ]

    const updated = clearDeletedReplyTarget(msgs, 'm1')
    expect(updated[1].reply_to_id).toBeNull()
    expect(updated[1].reply_to).toBeNull()
  })
})
