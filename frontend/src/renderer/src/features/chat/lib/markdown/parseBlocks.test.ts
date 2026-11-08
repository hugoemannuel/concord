import { describe, expect, it } from 'vitest'
import { parseBlocks } from './parseBlocks'
import type { MdBlock, MdInline } from './types'

const t = (text: string): MdInline => ({ type: 'text', text })
const p = (text: string): MdBlock => ({ type: 'paragraph', children: [t(text)] })

describe('parseBlocks', () => {
  it('texto vazio não tem blocos; texto comum é um parágrafo com as quebras', () => {
    expect(parseBlocks('')).toEqual([])
    expect(parseBlocks('a\nb')).toEqual([p('a\nb')])
  })

  it('bloco de código com linguagem (ignorada no desenho) e conteúdo literal', () => {
    expect(parseBlocks('```js\nconst x = **1**\n```')).toEqual([
      { type: 'code', lang: 'js', text: 'const x = **1**' }
    ])
  })

  it('bloco de código sem linguagem, numa linha só e com texto em volta', () => {
    expect(parseBlocks('antes\n```\na\nb\n```\ndepois')).toEqual([
      p('antes'),
      { type: 'code', lang: '', text: 'a\nb' },
      p('depois')
    ])
    expect(parseBlocks('```oi tudo```')).toEqual([{ type: 'code', lang: '', text: 'oi tudo' }])
    expect(parseBlocks('```a``` resto')).toEqual([{ type: 'code', lang: '', text: 'a' }, p(' resto')])
  })

  it('bloco sem fechamento: o resto da mensagem é texto normal', () => {
    expect(parseBlocks('```js\nx\n**y**')).toEqual([
      { type: 'paragraph', children: [t('```js\nx\n'), { type: 'bold', children: [t('y')] }] }
    ])
  })

  it('citação de uma linha junta as linhas seguidas; >>> vai até o fim', () => {
    expect(parseBlocks('> a\n> **b**\nc')).toEqual([
      {
        type: 'quote',
        children: [{ type: 'paragraph', children: [t('a\n'), { type: 'bold', children: [t('b')] }] }]
      },
      p('c')
    ])
    expect(parseBlocks('x\n>>> a\n# b\n> c')).toEqual([
      p('x'),
      {
        type: 'quote',
        children: [p('a'), { type: 'heading', level: 1, children: [t('b')] }, p('> c')]
      }
    ])
    expect(parseBlocks('>sem espaço')).toEqual([p('>sem espaço')])
  })

  it('títulos só até ### e com espaço depois', () => {
    expect(parseBlocks('# Um\n## Dois\n### Três')).toEqual([
      { type: 'heading', level: 1, children: [t('Um')] },
      { type: 'heading', level: 2, children: [t('Dois')] },
      { type: 'heading', level: 3, children: [t('Três')] }
    ])
    expect(parseBlocks('#### quatro')).toEqual([p('#### quatro')])
    expect(parseBlocks('#semespaço')).toEqual([p('#semespaço')])
    expect(parseBlocks('\\# escapado')).toEqual([p('# escapado')])
  })

  it('subtexto com -#', () => {
    expect(parseBlocks('-# rodapé')).toEqual([{ type: 'subtext', children: [t('rodapé')] }])
  })

  it('lista não ordenada com um nível de aninhamento', () => {
    expect(parseBlocks('- item 1\n  - item 2\n* item 3\nfim')).toEqual([
      {
        type: 'list',
        ordered: false,
        start: 1,
        items: [
          {
            children: [t('item 1')],
            nested: {
              type: 'list',
              ordered: false,
              start: 1,
              items: [{ children: [t('item 2')], nested: null }]
            }
          },
          { children: [t('item 3')], nested: null }
        ]
      },
      p('fim')
    ])
  })

  it('lista ordenada guarda o primeiro número; trocar o tipo abre outra lista', () => {
    const blocks = parseBlocks('3. a\n4. b\n- c')
    expect(blocks).toEqual([
      {
        type: 'list',
        ordered: true,
        start: 3,
        items: [
          { children: [t('a')], nested: null },
          { children: [t('b')], nested: null }
        ]
      },
      { type: 'list', ordered: false, start: 1, items: [{ children: [t('c')], nested: null }] }
    ])
  })

  it('item recuado sem item antes é item de cima; aninhado ordenado guarda o número', () => {
    expect(parseBlocks('  - solto\n  2. x')).toEqual([
      {
        type: 'list',
        ordered: false,
        start: 1,
        items: [
          {
            children: [t('solto')],
            nested: { type: 'list', ordered: true, start: 2, items: [{ children: [t('x')], nested: null }] }
          }
        ]
      }
    ])
  })

  it('*itálico* no começo da linha não é lista', () => {
    expect(parseBlocks('*oi*')).toEqual([{ type: 'paragraph', children: [{ type: 'italic', children: [t('oi')] }] }])
  })

  it('o exemplo da spec', () => {
    const text = [
      '# Título',
      '**negrito** ||spoiler|| `code` @alguem',
      '> citação',
      '- item 1',
      '  - item 2',
      '```js',
      'const x = 1',
      '```',
      '-# rodapé'
    ].join('\n')
    expect(parseBlocks(text).map((b) => b.type)).toEqual([
      'heading',
      'paragraph',
      'quote',
      'list',
      'code',
      'subtext'
    ])
  })
})
