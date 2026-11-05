import { describe, expect, it } from 'vitest'
import { EXPRESSION_TEXTS, expressionDisplayName, soundMeta, uploaderMeta } from './expressionTexts'

describe('textos da gestão de expressões', () => {
  it('cada tipo tem todos os textos preenchidos', () => {
    for (const texts of Object.values(EXPRESSION_TEXTS)) {
      for (const value of Object.values(texts)) {
        const text = typeof value === 'function' ? value('x') : value
        expect(text.length).toBeGreaterThan(0)
      }
    }
  })

  it('a confirmação diz o nome do item', () => {
    expect(EXPRESSION_TEXTS.emoji.deleteBody(':festa:')).toContain(':festa:')
    expect(EXPRESSION_TEXTS.sticker.deleteBody('risada')).toContain('risada')
    expect(EXPRESSION_TEXTS.sound.deleteBody('Corneta')).toContain('Corneta')
  })

  it('o emoji aparece entre dois-pontos; os outros, pelo nome', () => {
    expect(expressionDisplayName('emoji', 'festa')).toBe(':festa:')
    expect(expressionDisplayName('sticker', 'risada')).toBe('risada')
  })

  it('quem enviou, quando o servidor diz', () => {
    expect(uploaderMeta('Ana')).toBe('Enviado por Ana')
    expect(uploaderMeta('')).toBeUndefined()
    expect(uploaderMeta(undefined)).toBeUndefined()
  })

  it('som: a duração e quem enviou', () => {
    expect(soundMeta(1500, 'Ana')).toBe('1,5 s · Enviado por Ana')
    expect(soundMeta(800, '')).toBe('0,8 s')
  })
})
