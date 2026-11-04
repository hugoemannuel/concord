import { describe, expect, it } from 'vitest'
import { TAG_BADGES } from '../../../shared/ui/icons/serverTagBadges'
import { DEFAULT_TAG, cleanTagName, tagEditFrom, tagProblem, tagRenameWarning } from './tagRules'

describe('cleanTagName', () => {
  it('tira o que não é letra ou número e corta em 4', () => {
    expect(cleanTagName('a-b c!')).toBe('abc')
    expect(cleanTagName('WUMPUS')).toBe('WUMP')
    expect(cleanTagName('AÇÃO1')).toBe('AO1')
  })
})

describe('tagProblem', () => {
  it('aceita o que o backend aceita', () => {
    expect(tagProblem({ name: 'AB1', badge: 'raio', color: '#112233' })).toBeNull()
    expect(tagProblem({ name: '', badge: '', color: '' })).toBeNull()
  })
  it('recusa o resto', () => {
    expect(tagProblem({ name: 'ABCDE', badge: 'raio', color: '#112233' })).not.toBeNull()
    expect(tagProblem({ name: 'AB', badge: 'outro', color: '#112233' })).not.toBeNull()
    expect(tagProblem({ name: 'AB', badge: 'raio', color: 'red' })).not.toBeNull()
  })
})

describe('tagRenameWarning', () => {
  const saved = { server_id: 's', name: 'ABC', badge: 'raio', color: '#000000' }
  it('avisa só quando o nome de uma tag que existe muda', () => {
    expect(tagRenameWarning(saved, { name: 'ABD', badge: 'raio', color: '#000000' })).toBe(true)
    expect(tagRenameWarning(saved, { name: 'ABC', badge: 'lua', color: '#ffffff' })).toBe(false)
    expect(tagRenameWarning(null, { name: 'NOVA', badge: 'lua', color: '#ffffff' })).toBe(false)
    expect(tagRenameWarning(saved, { name: '', badge: 'lua', color: '#ffffff' })).toBe(true)
  })
})

describe('tagEditFrom', () => {
  it('sem tag: começa vazio com emblema e cor prontos', () => {
    expect(tagEditFrom(null)).toEqual({ ...DEFAULT_TAG, name: '' })
  })
  it('com tag: a própria', () => {
    expect(tagEditFrom({ server_id: 's', name: 'A', badge: 'lua', color: '#000000' })).toEqual({
      name: 'A',
      badge: 'lua',
      color: '#000000'
    })
  })
})

it('os emblemas padrão existem no conjunto', () => {
  expect(TAG_BADGES.some((b) => b.id === DEFAULT_TAG.badge)).toBe(true)
})
