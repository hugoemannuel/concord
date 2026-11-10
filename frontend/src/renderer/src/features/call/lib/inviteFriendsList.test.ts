import { describe, expect, it } from 'vitest'
import {
  emptyListText,
  invitableFriends,
  resultLine,
  sendHeadline,
  summarizeResults,
  toggleSelected
} from './inviteFriendsList'

const f = (id: string, display_name: string, username = id): never =>
  ({ id, username, display_name }) as never
const friends = [f('1', 'Zélia'), f('2', 'Ana'), f('3', 'Bruno', 'bru'), f('4', 'Caio')]

describe('invitableFriends', () => {
  it('tira quem já está na call', () => {
    const out = invitableFriends(friends, ['2'], '', () => true)
    expect(out.map((x) => x.id)).not.toContain('2')
  })

  it('busca por nome sem acento e por @usuário', () => {
    expect(invitableFriends(friends, [], 'zelia', () => true).map((x) => x.id)).toEqual(['1'])
    expect(invitableFriends(friends, [], 'BRU', () => true).map((x) => x.id)).toEqual(['3'])
  })

  it('online primeiro, depois ordem alfabética', () => {
    const online = new Set(['4', '1'])
    const out = invitableFriends(friends, [], '', (id) => online.has(id))
    expect(out.map((x) => x.id)).toEqual(['4', '1', '2', '3'])
  })
})

describe('toggleSelected', () => {
  it('marca e desmarca', () => {
    expect(toggleSelected([], 'a')).toEqual(['a'])
    expect(toggleSelected(['a', 'b'], 'a')).toEqual(['b'])
  })
})

describe('summarizeResults', () => {
  it('conta os enviados e lista quem ficou de fora', () => {
    const out = summarizeResults([
      { user_id: 'a', status: 'sent' },
      { user_id: 'b', status: 'busy' }
    ])
    expect(out.sent).toBe(1)
    expect(out.failed).toEqual([{ user_id: 'b', status: 'busy' }])
  })
})

describe('sendHeadline', () => {
  it('todos, alguns ou nenhum', () => {
    expect(sendHeadline(1, 1)).toBe('Convite enviado.')
    expect(sendHeadline(3, 3)).toBe('3 convites enviados.')
    expect(sendHeadline(1, 3)).toContain('1 de 3')
    expect(sendHeadline(0, 2)).toBe('Nenhum convite foi enviado.')
  })
})

describe('resultLine', () => {
  it('falha é ruim, enviado é bom', () => {
    expect(resultLine('busy').tone).toBe('bad')
    expect(resultLine('failed').tone).toBe('bad')
    expect(resultLine('sent')).toEqual({
      text: 'Convite enviado na conversa privada',
      tone: 'good'
    })
  })
})

describe('emptyListText', () => {
  it('sem amigos, todos na call ou busca sem resultado', () => {
    expect(emptyListText(0, 0)).toBe('Ninguém para convidar ainda.')
    expect(emptyListText(3, 0)).toBe('Todo mundo já está na call.')
    expect(emptyListText(3, 2)).toBe('Ninguém encontrado.')
  })
})
