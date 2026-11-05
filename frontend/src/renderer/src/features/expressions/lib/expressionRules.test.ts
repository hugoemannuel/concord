import { describe, expect, it } from 'vitest'
import { DEFAULT_EVERYONE, Perm } from '../../servers/lib/permissions'
import {
  canAddExpression,
  canManageExpression,
  expressionCountText,
  expressionNameError,
  formatSoundDuration,
  isExpressionFull
} from './expressionRules'

describe('quem pode enviar', () => {
  it('cada tipo pede a sua permissão de adicionar', () => {
    expect(canAddExpression('emoji', Perm.ADD_EMOJIS)).toBe(true)
    expect(canAddExpression('emoji', Perm.ADD_STICKERS)).toBe(false)
    expect(canAddExpression('sticker', Perm.ADD_STICKERS)).toBe(true)
    expect(canAddExpression('sound', Perm.ADD_SOUNDS)).toBe(true)
    expect(canAddExpression('sound', Perm.MANAGE_EXPRESSIONS)).toBe(false)
  })

  it('o membro comum envia os três', () => {
    expect(canAddExpression('emoji', DEFAULT_EVERYONE)).toBe(true)
    expect(canAddExpression('sticker', DEFAULT_EVERYONE)).toBe(true)
    expect(canAddExpression('sound', DEFAULT_EVERYONE)).toBe(true)
  })
})

describe('quem pode editar e apagar', () => {
  const item = { uploader_id: 'ana' }

  it('quem enviou, mesmo sem permissão', () => {
    expect(canManageExpression(item, 'ana', 0)).toBe(true)
  })

  it('outra pessoa só com Gerenciar expressões', () => {
    expect(canManageExpression(item, 'bia', DEFAULT_EVERYONE)).toBe(false)
    expect(canManageExpression(item, 'bia', Perm.MANAGE_EXPRESSIONS)).toBe(true)
  })

  it('sem sessão não confunde com envio sem dono', () => {
    expect(canManageExpression({ uploader_id: '' }, undefined, 0)).toBe(false)
  })
})

describe('limite por servidor', () => {
  it('conta "N de limite" de cada tipo', () => {
    expect(expressionCountText('emoji', 3)).toBe('3 de 50 emojis')
    expect(expressionCountText('sticker', 0)).toBe('0 de 60 figurinhas')
    expect(expressionCountText('sound', 12)).toBe('12 de 50 sons')
  })

  it('cheio no limite', () => {
    expect(isExpressionFull('emoji', 49)).toBe(false)
    expect(isExpressionFull('emoji', 50)).toBe(true)
    expect(isExpressionFull('sticker', 59)).toBe(false)
    expect(isExpressionFull('sticker', 60)).toBe(true)
    expect(isExpressionFull('sound', 50)).toBe(true)
  })
})

describe('validação do nome', () => {
  it('emoji: 2 a 32 letras, números ou _ (igual ao backend)', () => {
    expect(expressionNameError('emoji', 'festa_2')).toBeNull()
    expect(expressionNameError('emoji', 'a')).toBe(
      'O nome precisa ter de 2 a 32 letras, números ou _.'
    )
    expect(expressionNameError('emoji', 'com espaço')).not.toBeNull()
    expect(expressionNameError('emoji', 'x'.repeat(33))).not.toBeNull()
  })

  it('figurinha e som: 1 a 32 caracteres, sem contar os espaços das pontas', () => {
    expect(expressionNameError('sticker', ' Risada alta ')).toBeNull()
    expect(expressionNameError('sound', '   ')).toBe('O nome precisa ter de 1 a 32 caracteres.')
    expect(expressionNameError('sound', 'x'.repeat(33))).toBe(
      'O nome precisa ter de 1 a 32 caracteres.'
    )
    expect(expressionNameError('sticker', 'x'.repeat(32))).toBeNull()
  })
})

describe('duração do som', () => {
  it('em segundos, com uma casa e vírgula', () => {
    expect(formatSoundDuration(1500)).toBe('1,5 s')
    expect(formatSoundDuration(15000)).toBe('15,0 s')
    expect(formatSoundDuration(0)).toBe('0,0 s')
  })
})
