import { describe, expect, it, vi } from 'vitest'
import type { Message } from '../api/messages'
import {
  bindRowHandlers,
  messageRowProps,
  type MessageRowHandlers,
  type RowViewState
} from './messageRows'

const IDLE: RowViewState = { highlightedId: null, editingId: null, savingEdit: false }

function msg(id: string, author: string, minute: number): Message {
  return {
    id,
    author_id: author,
    channel_id: 'c1',
    content: id,
    created_at: `2026-01-01T10:${String(minute).padStart(2, '0')}:00Z`
  }
}

/** O mesmo teste que o memo do React faz: cada prop igual por Object.is. */
function shallowEqual(a: object, b: object): boolean {
  const ka = Object.keys(a) as (keyof typeof a)[]
  return ka.length === Object.keys(b).length && ka.every((k) => Object.is(a[k], b[k]))
}

function rows(messages: Message[], view: RowViewState = IDLE): object[] {
  return messages.map((_, i) => messageRowProps(messages, i, view))
}

describe('messageRowProps', () => {
  const before = [msg('m1', 'ana', 0), msg('m2', 'bia', 1)]

  it('mensagem nova não muda as props das linhas que já estavam (o memo pula)', () => {
    const after = [...before, msg('m3', 'ana', 2)]
    const [old, next] = [rows(before), rows(after)]
    old.forEach((props, i) => expect(shallowEqual(props, next[i])).toBe(true))
    expect(next).toHaveLength(3)
  })

  it('mensagem agrupada com a anterior também não redesenha a anterior', () => {
    const after = [...before, msg('m3', 'bia', 2)]
    const next = rows(after)
    expect(next[2]).toMatchObject({ grouped: true, previous: before[1] })
    rows(before).forEach((props, i) => expect(shallowEqual(props, next[i])).toBe(true))
  })

  it('destaque e edição só mudam a linha da mensagem', () => {
    const view: RowViewState = { highlightedId: 'm2', editingId: 'm2', savingEdit: true }
    const [idle, active] = [rows(before), rows(before, view)]
    expect(shallowEqual(idle[0], active[0])).toBe(true)
    expect(active[1]).toMatchObject({ isHighlighted: true, isEditing: true, savingEdit: true })
  })

  it('salvando outra mensagem não marca esta', () => {
    const view: RowViewState = { highlightedId: null, editingId: 'm1', savingEdit: true }
    expect(rows(before, view)[1]).toMatchObject({ isEditing: false, savingEdit: false })
  })
})

describe('bindRowHandlers', () => {
  it('cada ação da linha chama a do chat com a mensagem dela', async () => {
    const h: MessageRowHandlers = {
      onReply: vi.fn(),
      onReact: vi.fn(),
      onJumpToMessage: vi.fn(),
      onDelete: vi.fn(),
      onVote: vi.fn(async () => {}),
      onEndPoll: vi.fn(async () => {}),
      onCopy: vi.fn(),
      onStartEdit: vi.fn(),
      onSaveEdit: vi.fn(),
      onCancelEdit: vi.fn(),
      onTogglePin: vi.fn()
    }
    const m = msg('m1', 'ana', 0)
    const bound = bindRowHandlers(h, m)
    bound.onReply()
    bound.onReact('ok')
    bound.onJumpToMessage('m0')
    bound.onDelete()
    await bound.onVote([1, 2])
    await bound.onEndPoll()
    bound.onCopy()
    bound.onStartEdit()
    bound.onSaveEdit('novo')
    bound.onCancelEdit()
    bound.onTogglePin()

    expect(h.onReply).toHaveBeenCalledWith(m)
    expect(h.onReact).toHaveBeenCalledWith(m, 'ok')
    expect(h.onJumpToMessage).toHaveBeenCalledWith('m0')
    expect(h.onDelete).toHaveBeenCalledWith(m)
    expect(h.onVote).toHaveBeenCalledWith(m, [1, 2])
    expect(h.onEndPoll).toHaveBeenCalledWith(m)
    expect(h.onCopy).toHaveBeenCalledWith(m)
    expect(h.onStartEdit).toHaveBeenCalledWith(m)
    expect(h.onSaveEdit).toHaveBeenCalledWith(m, 'novo')
    expect(h.onCancelEdit).toHaveBeenCalled()
    expect(h.onTogglePin).toHaveBeenCalledWith(m)
  })
})
