import { describe, expect, it, vi } from 'vitest'
import type { Conversation, ConversationSummary } from '../../chat/api/conversations'
import {
  createdConversationRoute,
  filterAvailableFriends,
  freeSlots,
  groupSubmitLabel,
  slotsHint,
  submitGroupSelection,
  toggleSelected
} from './groupPicker'

const friend = (
  id: string,
  username: string,
  display_name: string
): { id: string; username: string; display_name: string } => ({
  id,
  username,
  display_name
})
const friends = [
  friend('a', 'ana', 'Ana Souza'),
  friend('b', 'bia', 'Beatriz'),
  friend('c', 'caio', 'Caio')
]

describe('filterAvailableFriends', () => {
  it('tira quem já está no grupo', () => {
    expect(filterAvailableFriends(friends, ['b'], '').map((f) => f.id)).toEqual(['a', 'c'])
  })
  it('busca pelo usuário ou pelo nome, sem caixa e sem espaços', () => {
    expect(filterAvailableFriends(friends, [], '  CAI ').map((f) => f.id)).toEqual(['c'])
    expect(filterAvailableFriends(friends, [], 'souza').map((f) => f.id)).toEqual(['a'])
  })
})

describe('freeSlots', () => {
  it('conta você quando o grupo ainda não existe', () => {
    expect(freeSlots(0, 0)).toBe(9)
    expect(freeSlots(0, 2)).toBe(7)
  })
  it('num grupo existente desconta quem já está', () => {
    expect(freeSlots(4, 1)).toBe(5)
  })
})

describe('toggleSelected', () => {
  it('desmarca quem estava marcado', () => {
    expect(toggleSelected(['a', 'b'], 'a', 0)).toEqual(['b'])
  })
  it('marca se ainda há vaga', () => {
    expect(toggleSelected(['a'], 'b', 1)).toEqual(['a', 'b'])
  })
  it('sem vaga não marca', () => {
    const cur = ['a']
    expect(toggleSelected(cur, 'b', 0)).toBe(cur)
  })
})

describe('slotsHint', () => {
  it('singular, plural e cheio', () => {
    expect(slotsHint(1)).toBe('Você pode adicionar mais 1 amigo.')
    expect(slotsHint(3)).toBe('Você pode adicionar mais 3 amigos.')
    expect(slotsHint(0)).toBe('Este grupo já está cheio.')
  })
})

describe('groupSubmitLabel', () => {
  it('adicionar, criar grupo ou DM', () => {
    expect(groupSubmitLabel('g1', 3)).toBe('Adicionar')
    expect(groupSubmitLabel(undefined, 2)).toBe('Criar grupo')
    expect(groupSubmitLabel(undefined, 1)).toBe('Criar DM')
  })
})

describe('createdConversationRoute', () => {
  const group = { id: 'g9', type: 'group' } as Conversation
  const dm = { id: 'd9', type: 'dm' } as Conversation
  it('usa a conversa já na lista', () => {
    const summary = { id: 'g9', type: 'group' } as ConversationSummary
    expect(createdConversationRoute(group, summary, 'me', 'a')).toBe('/dm/c/g9')
  })
  it('sem resumo: grupo pelo id, DM pelo amigo escolhido', () => {
    expect(createdConversationRoute(group, undefined, 'me', 'a')).toBe('/dm/c/g9')
    expect(createdConversationRoute(dm, undefined, 'me', 'a')).toBe('/dm/a')
  })
})

describe('submitGroupSelection', () => {
  const deps = (): Parameters<typeof submitGroupSelection>[0] => ({
    addMembers: vi.fn(async () => undefined),
    createGroup: vi.fn(async () => ({ id: 'g9', type: 'group' }) as Conversation),
    fetchConversations: vi.fn(async () => undefined),
    findSummary: vi.fn(() => undefined),
    navigate: vi.fn(),
    done: vi.fn(),
    error: vi.fn()
  })

  it('grupo existente: adiciona, recarrega e fecha sem navegar', async () => {
    const d = deps()
    await submitGroupSelection(d, { groupId: 'g1', selected: ['a'], meId: 'me' })
    expect(d.addMembers).toHaveBeenCalledWith('g1', ['a'])
    expect(d.fetchConversations).toHaveBeenCalled()
    expect(d.createGroup).not.toHaveBeenCalled()
    expect(d.navigate).not.toHaveBeenCalled()
    expect(d.done).toHaveBeenCalled()
  })

  it('novo: cria, recarrega, abre a conversa e fecha', async () => {
    const d = deps()
    await submitGroupSelection(d, { selected: ['a', 'b'], meId: 'me' })
    expect(d.createGroup).toHaveBeenCalledWith(['a', 'b'])
    expect(d.findSummary).toHaveBeenCalledWith('g9')
    expect(d.navigate).toHaveBeenCalledWith('/dm/c/g9')
    expect(d.done).toHaveBeenCalled()
  })

  it('falha: não fecha e avisa com a mensagem do erro', async () => {
    const d = deps()
    d.createGroup = vi.fn(async () => Promise.reject(new Error('cheio')))
    await submitGroupSelection(d, { selected: ['a'], meId: 'me' })
    expect(d.done).not.toHaveBeenCalled()
    expect(d.error).toHaveBeenCalledWith('cheio')
  })

  it('falha sem Error usa o texto padrão', async () => {
    const d = deps()
    d.addMembers = vi.fn(async () => Promise.reject('x'))
    await submitGroupSelection(d, { groupId: 'g1', selected: ['a'], meId: 'me' })
    expect(d.error).toHaveBeenCalledWith('Não foi possível criar o grupo.')
  })
})
