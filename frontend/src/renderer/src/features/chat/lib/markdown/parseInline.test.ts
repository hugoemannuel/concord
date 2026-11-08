import { describe, expect, it } from 'vitest'
import { parseInline } from './parseInline'
import type { MdInline } from './types'

const t = (text: string): MdInline => ({ type: 'text', text })
const s = (type: 'bold' | 'italic' | 'underline' | 'strike' | 'spoiler', ...children: MdInline[]): MdInline => ({
  type,
  children
})

describe('parseInline', () => {
  it.each<[string, MdInline[]]>([
    ['oi', [t('oi')]],
    ['', []],
    ['**negrito**', [s('bold', t('negrito'))]],
    ['*itálico*', [s('italic', t('itálico'))]],
    ['_itálico_', [s('italic', t('itálico'))]],
    ['__sub__', [s('underline', t('sub'))]],
    ['~~risco~~', [s('strike', t('risco'))]],
    ['||segredo||', [s('spoiler', t('segredo'))]],
    ['a **b** c', [t('a '), s('bold', t('b')), t(' c')]]
  ])('%j', (input, expected) => {
    expect(parseInline(input)).toEqual(expected)
  })

  it('código no meio da frase é literal, com uma ou duas crases', () => {
    expect(parseInline('`**x** @ana`')).toEqual([{ type: 'code', text: '**x** @ana' }])
    expect(parseInline('a ``x ` y`` b')).toEqual([
      t('a '),
      { type: 'code', text: 'x ` y' },
      t(' b')
    ])
    expect(parseInline('```x```')).toEqual([{ type: 'code', text: 'x' }])
  })

  it('aninha combinações', () => {
    expect(parseInline('***x***')).toEqual([s('bold', s('italic', t('x')))])
    expect(parseInline('__**x**__')).toEqual([s('underline', s('bold', t('x')))])
    expect(parseInline('||a **b**||')).toEqual([s('spoiler', t('a '), s('bold', t('b')))])
    expect(parseInline('*a **b** c*')).toEqual([s('italic', t('a '), s('bold', t('b')), t(' c'))])
  })

  it('marcador sem par sai literal', () => {
    expect(parseInline('**sem par')).toEqual([t('**sem par')])
    expect(parseInline('a ~~ b')).toEqual([t('a ~~ b')])
    expect(parseInline('`sem fim')).toEqual([t('`sem fim')])
    expect(parseInline('||')).toEqual([t('||')])
    expect(parseInline('****')).toEqual([t('****')])
  })

  it('itálico com * não abre nem fecha colado em espaço', () => {
    expect(parseInline('2 * 3 * 4')).toEqual([t('2 * 3 * 4')])
    expect(parseInline('*a *')).toEqual([t('*a *')])
  })

  it('_ só vale com borda de palavra', () => {
    expect(parseInline('snake_case_nome')).toEqual([t('snake_case_nome')])
    expect(parseInline('a _b_c')).toEqual([t('a _b_c')])
    expect(parseInline('(_x_)')).toEqual([t('('), s('italic', t('x')), t(')')])
  })

  it('escape deixa o caractere literal', () => {
    expect(parseInline('\\*não\\*')).toEqual([t('*não*')])
    expect(parseInline('\\`x\\`')).toEqual([t('`x`')])
    expect(parseInline('\\\\')).toEqual([t('\\')])
    expect(parseInline('a\\b')).toEqual([t('a\\b')])
    expect(parseInline('**a\\**b**')).toEqual([s('bold', t('a**b'))])
  })

  it('<https://…> vira autolink sem os sinais', () => {
    expect(parseInline('veja <https://x.com/a_b_> ok')).toEqual([
      t('veja '),
      { type: 'autolink', text: 'https://x.com/a_b_' },
      t(' ok')
    ])
    expect(parseInline('<http:/x>')).toEqual([t('<http:/x>')])
  })

  it('markdown dentro de link cru não conta', () => {
    expect(parseInline('x https://a.com/__init__.py y')).toEqual([t('x https://a.com/__init__.py y')])
    expect(parseInline('www.a.com/*b*')).toEqual([t('www.a.com/*b*')])
    expect(parseInline('**https://a.com**')).toEqual([s('bold', t('https://a.com'))])
  })

  it('link e menção dentro de negrito continuam texto (viram link/chip no desenho)', () => {
    expect(parseInline('**@ana veja https://x.com**')).toEqual([s('bold', t('@ana veja https://x.com'))])
  })

  it('texto hostil não explode (sem custo quadrático nem pilha funda)', () => {
    const hostile = '**'.repeat(2000) + '~~'.repeat(2000) + '*_'.repeat(2000) + '`'.repeat(3000)
    const start = performance.now()
    parseInline(hostile)
    expect(performance.now() - start).toBeLessThan(500)
    const deep = '||'.repeat(200) + 'x' + '||'.repeat(200)
    expect(() => parseInline(deep)).not.toThrow()
  })
})
