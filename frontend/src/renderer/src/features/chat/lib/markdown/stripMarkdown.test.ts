import { describe, expect, it } from 'vitest'
import { plainText, stripMarkdown } from './stripMarkdown'
import { parseBlocks } from './parseBlocks'

describe('stripMarkdown', () => {
  it.each([
    ['oi', 'oi'],
    ['**negrito** *it* __sub__ ~~r~~', 'negrito it sub r'],
    ['`code` e <https://x.com>', 'code e https://x.com'],
    ['# Título\n-# rodapé', 'Título\nrodapé'],
    ['> citação\nfora', 'citação\nfora'],
    ['- a\n  - b\n1. c', 'a\nb\nc'],
    ['```js\nconst x = 1\n```', 'const x = 1'],
    ['', '']
  ])('%j → %j', (input, expected) => {
    expect(stripMarkdown(input)).toBe(expected)
  })

  it('o conteúdo do spoiler não aparece na prévia', () => {
    expect(stripMarkdown('a resposta é ||**42**||')).toBe('a resposta é ▮▮▮▮')
  })
})

describe('plainText', () => {
  it('só devolve o texto de mensagem sem formatação (um parágrafo de texto)', () => {
    expect(plainText(parseBlocks('oi <:festa:1>'))).toBe('oi <:festa:1>')
    expect(plainText(parseBlocks('**oi**'))).toBeNull()
    expect(plainText(parseBlocks('a\n# b'))).toBeNull()
    expect(plainText(parseBlocks('# b'))).toBeNull()
    expect(plainText([])).toBeNull()
  })
})
