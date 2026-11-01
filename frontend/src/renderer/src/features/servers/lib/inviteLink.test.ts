import { describe, expect, it } from 'vitest'
import {
  authPathWithInvite,
  findInviteDeepLink,
  inviteCodeFromSearch,
  inviteDeepLink,
  inviteLink,
  normalizeInviteCode,
  parseInviteDeepLink,
  parseInviteInput,
  parseOwnInviteUrl
} from './inviteLink'

describe('inviteLink', () => {
  it('monta o link do navegador e o do app', () => {
    expect(inviteLink('K7P2QX9M')).toBe('https://app-salinha.bhrx.com.br/convite/K7P2QX9M')
    expect(inviteDeepLink('K7P2QX9M')).toBe('salinha://convite/K7P2QX9M')
  })

  it('no app web de outro servidor, usa o endereço dele (servidor próprio)', () => {
    expect(inviteLink('K7P2QX9M', 'https://1-2-3-4.sslip.io')).toBe('https://1-2-3-4.sslip.io/convite/K7P2QX9M')
  })
})

describe('normalizeInviteCode', () => {
  it('aceita o código como as pessoas digitam', () => {
    expect(normalizeInviteCode('k7p2qx9m')).toBe('K7P2QX9M')
    expect(normalizeInviteCode('  k7p2-qx9m ')).toBe('K7P2QX9M')
    expect(normalizeInviteCode('K7 P2 QX 9M')).toBe('K7P2QX9M')
  })

  it('recusa o que não pode ser um código', () => {
    for (const bad of ['', '   ', 'abc', 'A'.repeat(17), 'K7P2/QX9M', 'K7P2QX9M?x=1', 'çãoçãoçã']) {
      expect(normalizeInviteCode(bad)).toBeNull()
    }
  })
})

describe('parseInviteDeepLink', () => {
  it('aceita só salinha://convite/<código>', () => {
    expect(parseInviteDeepLink('salinha://convite/K7P2QX9M')).toBe('K7P2QX9M')
    expect(parseInviteDeepLink('salinha://convite/k7p2qx9m')).toBe('K7P2QX9M')
    // O Windows/navegador às vezes acrescenta a barra final.
    expect(parseInviteDeepLink('salinha://convite/K7P2QX9M/')).toBe('K7P2QX9M')
    expect(parseInviteDeepLink('SALINHA://CONVITE/K7P2QX9M')).toBe('K7P2QX9M')
  })

  it('recusa qualquer outra coisa', () => {
    for (const bad of [
      '',
      'salinha://',
      'salinha://convite/',
      'salinha://convite',
      'salinha://convite/K7P2-QX9M',
      'salinha://convite/K7P2QX9M?x=1',
      'salinha://convite/K7P2QX9M#x',
      'salinha://convite/K7P2QX9M/extra',
      'salinha://convite//K7P2QX9M',
      'salinha://convite/../K7P2QX9M',
      'salinha://convite/%4B7P2QX9M',
      'salinha://user@convite/K7P2QX9M',
      'salinha://convite:80/K7P2QX9M',
      'salinha://servers/K7P2QX9M',
      'salinha:convite/K7P2QX9M',
      'https://app-salinha.bhrx.com.br/convite/K7P2QX9M',
      ' salinha://convite/K7P2QX9M',
      'salinha://convite/K7P2QX9M ',
      'salinha://convite/' + 'A'.repeat(17),
      'salinha://convite/ABC',
      '--hidden'
    ]) {
      expect(parseInviteDeepLink(bad), bad).toBeNull()
    }
  })
})

describe('findInviteDeepLink', () => {
  it('acha o link entre os args (partida a frio e segunda instância)', () => {
    expect(
      findInviteDeepLink(['C:\\Salinha\\Salinha.exe', '--hidden', 'salinha://convite/K7P2QX9M'])
    ).toBe('K7P2QX9M')
    expect(
      findInviteDeepLink([
        'Salinha.exe',
        '--allow-file-access-from-files',
        'salinha://convite/ABCD2345/'
      ])
    ).toBe('ABCD2345')
  })

  it('sem link válido, null (args do autostart ficam como estão)', () => {
    expect(findInviteDeepLink(['Salinha.exe', '--hidden'])).toBeNull()
    expect(findInviteDeepLink(['Salinha.exe', 'salinha://convite/K7P2QX9M?x'])).toBeNull()
    expect(findInviteDeepLink([])).toBeNull()
  })
})

describe('parseInviteInput', () => {
  it('aceita código, link do navegador e link do app', () => {
    expect(parseInviteInput('k7p2qx9m')).toBe('K7P2QX9M')
    expect(parseInviteInput('https://app-salinha.bhrx.com.br/convite/K7P2QX9M')).toBe('K7P2QX9M')
    expect(parseInviteInput('  https://app-salinha.bhrx.com.br/convite/k7p2qx9m/  ')).toBe(
      'K7P2QX9M'
    )
    expect(parseInviteInput('app-salinha.bhrx.com.br/convite/K7P2QX9M')).toBe('K7P2QX9M')
    expect(parseInviteInput('http://localhost:4173/convite/K7P2QX9M?utm=x')).toBe('K7P2QX9M')
    expect(parseInviteInput('salinha://convite/K7P2QX9M')).toBe('K7P2QX9M')
  })

  it('recusa links que não são de convite', () => {
    for (const bad of [
      '',
      'https://app-salinha.bhrx.com.br/',
      'https://app-salinha.bhrx.com.br/servers/K7P2QX9M',
      'https://app-salinha.bhrx.com.br/convite/',
      'https://app-salinha.bhrx.com.br/convite/K7P2/QX9M',
      'javascript:alert(1)',
      'K7P2QX9M K7P2QX9M K7'
    ]) {
      expect(parseInviteInput(bad), bad).toBeNull()
    }
  })
})

describe('convite na volta do login', () => {
  it('lê ?convite= e ignora código inválido', () => {
    expect(inviteCodeFromSearch('?convite=k7p2qx9m')).toBe('K7P2QX9M')
    expect(inviteCodeFromSearch('?outra=1&convite=K7P2QX9M')).toBe('K7P2QX9M')
    expect(inviteCodeFromSearch('')).toBeNull()
    expect(inviteCodeFromSearch('?convite=../../x')).toBeNull()
  })

  it('leva o código entre login e cadastro', () => {
    expect(authPathWithInvite('/login', 'K7P2QX9M')).toBe('/login?convite=K7P2QX9M')
    expect(authPathWithInvite('/register', 'K7P2QX9M')).toBe('/register?convite=K7P2QX9M')
    expect(authPathWithInvite('/register', null)).toBe('/register')
  })
})

describe('parseOwnInviteUrl', () => {
  const sslip = 'https://74-0-5-252.sslip.io'

  it('aceita os nossos endereços em /convite/<código>', () => {
    expect(parseOwnInviteUrl('https://app-salinha.bhrx.com.br/convite/K7P2QX9M')).toBe('K7P2QX9M')
    expect(parseOwnInviteUrl('https://salinha.bhrx.com.br/convite/k7p2qx9m/')).toBe('K7P2QX9M')
    expect(parseOwnInviteUrl('HTTPS://APP-SALINHA.BHRX.COM.BR/convite/K7P2QX9M')).toBe('K7P2QX9M')
    expect(parseOwnInviteUrl(`${sslip}/convite/K7P2QX9M`, [sslip])).toBe('K7P2QX9M')
    expect(
      parseOwnInviteUrl('http://localhost:4173/convite/K7P2QX9M', ['http://localhost:4173'])
    ).toBe('K7P2QX9M')
  })

  it('ignora query e fragmento', () => {
    expect(parseOwnInviteUrl('https://app-salinha.bhrx.com.br/convite/K7P2QX9M?utm=x#y')).toBe(
      'K7P2QX9M'
    )
  })

  it('recusa host que não é nosso', () => {
    for (const bad of [
      'https://exemplo.com/convite/K7P2QX9M',
      'https://app-salinha.bhrx.com.br.evil.com/convite/K7P2QX9M',
      'https://evil.com/https://app-salinha.bhrx.com.br/convite/K7P2QX9M',
      'https://xapp-salinha.bhrx.com.br/convite/K7P2QX9M',
      'https://bhrx.com.br/convite/K7P2QX9M',
      'https://user@app-salinha.bhrx.com.br/convite/K7P2QX9M',
      'https://user:pw@app-salinha.bhrx.com.br/convite/K7P2QX9M',
      'https://app-salinha.bhrx.com.br:8443/convite/K7P2QX9M',
      'http://app-salinha.bhrx.com.br/convite/K7P2QX9M',
      `${sslip}/convite/K7P2QX9M`
    ]) {
      expect(parseOwnInviteUrl(bad), bad).toBeNull()
    }
  })

  it('recusa esquema que não é http(s)', () => {
    for (const bad of [
      'javascript://app-salinha.bhrx.com.br/convite/K7P2QX9M',
      'ftp://app-salinha.bhrx.com.br/convite/K7P2QX9M',
      'salinha://convite/K7P2QX9M',
      'file:///convite/K7P2QX9M'
    ]) {
      expect(parseOwnInviteUrl(bad), bad).toBeNull()
    }
  })

  it('recusa caminho ou código inválido', () => {
    for (const bad of [
      'https://app-salinha.bhrx.com.br/',
      'https://app-salinha.bhrx.com.br/convite',
      'https://app-salinha.bhrx.com.br/convite/',
      'https://app-salinha.bhrx.com.br/convite/ABC',
      'https://app-salinha.bhrx.com.br/convite/' + 'A'.repeat(17),
      'https://app-salinha.bhrx.com.br/convite/K7P2-QX9M',
      'https://app-salinha.bhrx.com.br/convite/K7P2QX9M/extra',
      'https://app-salinha.bhrx.com.br/convite/%4B7P2QX9M',
      'https://app-salinha.bhrx.com.br/convite/../servers/1',
      'https://app-salinha.bhrx.com.br/Convite/K7P2QX9M',
      'https://app-salinha.bhrx.com.br/servers/K7P2QX9M',
      'não é url',
      ''
    ]) {
      expect(parseOwnInviteUrl(bad), bad).toBeNull()
    }
  })

  it('origem extra vazia ou inválida não libera nada', () => {
    expect(
      parseOwnInviteUrl('https://exemplo.com/convite/K7P2QX9M', [undefined, '', 'lixo'])
    ).toBeNull()
    expect(parseOwnInviteUrl('https://app-salinha.bhrx.com.br/convite/K7P2QX9M', ['lixo'])).toBe(
      'K7P2QX9M'
    )
  })
})
