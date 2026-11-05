import { describe, expect, it } from 'vitest'
import { inviteCodesIn, MAX_INVITE_EMBEDS } from './inviteEmbeds'

const SSLIP = 'https://74-0-5-252.sslip.io'

describe('inviteCodesIn', () => {
  it('link de convite nosso no texto vira o código', () => {
    expect(inviteCodesIn('entra aí https://app-salinha.bhrx.com.br/convite/abcd1234')).toEqual([
      'ABCD1234'
    ])
  })

  it('aceita a origem do servidor (servidor próprio)', () => {
    expect(inviteCodesIn(`${SSLIP}/convite/XYZ9`, [SSLIP])).toEqual(['XYZ9'])
  })

  it('link de outro site ou caminho diferente não vira cartão', () => {
    expect(inviteCodesIn('https://evil.com/convite/ABCD1234')).toEqual([])
    expect(inviteCodesIn('https://app-salinha.bhrx.com.br/outra/ABCD1234')).toEqual([])
    expect(inviteCodesIn('sem link nenhum')).toEqual([])
  })

  it('o mesmo convite repetido vira um cartão só', () => {
    const link = 'https://app-salinha.bhrx.com.br/convite/ABCD1234'
    expect(inviteCodesIn(`${link} e de novo ${link.toLowerCase()}`)).toEqual(['ABCD1234'])
  })

  it(`no máximo ${MAX_INVITE_EMBEDS} cartões por mensagem`, () => {
    const links = ['AAAA', 'BBBB', 'CCCC', 'DDDD']
      .map((c) => `https://app-salinha.bhrx.com.br/convite/${c}`)
      .join(' ')
    expect(inviteCodesIn(links)).toEqual(['AAAA', 'BBBB', 'CCCC'])
  })
})
