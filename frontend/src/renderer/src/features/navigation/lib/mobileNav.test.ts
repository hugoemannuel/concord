import { describe, expect, it } from 'vitest'
import {
  initialPanel,
  panelAfterNavigation,
  sectionKind,
  sectionOf,
  shellPanelClasses
} from './mobileNav'

describe('sectionOf', () => {
  it.each([
    ['/', 'home'],
    ['/friends', 'home'],
    ['/dm/u1', 'home'],
    ['/dm/c/c1', 'home'],
    ['/servers/s1', 'server:s1'],
    ['/servers/s1/channels/c1', 'server:s1'],
    ['/melhorias', 'improvements'],
    ['/proposals', 'improvements'],
    ['/changelog', 'improvements'],
    ['/ranking', 'improvements'],
    ['/visitas/s1', 'visit:s1']
  ])('%s → %s', (path, section) => {
    expect(sectionOf(path)).toBe(section)
  })

  it('o tipo da seção escolhe a coluna da esquerda (servidor, visita ou Início)', () => {
    expect(sectionKind('/servers/s1/channels/c1')).toBe('server')
    expect(sectionKind('/visitas/s1')).toBe('visit')
    expect(sectionKind('/friends')).toBe('home')
    expect(sectionKind('/proposals')).toBe('improvements')
  })
})

describe('initialPanel', () => {
  it.each([
    ['/', 'nav'],
    ['/friends', 'nav'],
    ['/servers/s1', 'nav'],
    ['/servers/s1/channels/c1', 'content'],
    ['/dm/u1', 'content'],
    ['/dm/c/c1', 'content'],
    ['/melhorias', 'content'],
    ['/proposals', 'content'],
    ['/changelog', 'content'],
    ['/ranking', 'content'],
    // Visita (link de visitante): abre direto na call, com o voltar para a lista.
    ['/visitas/s1', 'content'],
    // Painel das lives (devs): tela própria, sem lista.
    ['/observabilidade', 'content'],
    // Mensagens favoritas: tela própria, com o voltar para a lista.
    ['/favoritas', 'content']
  ] as const)('abrir em %s mostra %s', (path, panel) => {
    expect(initialPanel(path)).toBe(panel)
  })
})

describe('panelAfterNavigation', () => {
  const nav = (prev: string, next: string, action: 'PUSH' | 'REPLACE' | 'POP' = 'PUSH') =>
    ({ prev, next, action }) as const

  it('escolher um canal do mesmo servidor abre o chat', () => {
    expect(panelAfterNavigation(nav('/servers/s1/channels/a', '/servers/s1/channels/b'), 'nav')).toBe(
      'content'
    )
  })

  it('tocar de novo no canal aberto (mesmo caminho) abre o chat', () => {
    expect(
      panelAfterNavigation(nav('/servers/s1/channels/a', '/servers/s1/channels/a', 'REPLACE'), 'nav')
    ).toBe('content')
  })

  it('trocar de servidor pelo trilho mostra a lista de canais', () => {
    expect(panelAfterNavigation(nav('/servers/s1/channels/a', '/servers/s2'), 'content')).toBe('nav')
  })

  it('o redirecionamento para o último canal não tira a lista da frente', () => {
    expect(
      panelAfterNavigation(nav('/servers/s2', '/servers/s2/channels/a', 'REPLACE'), 'nav')
    ).toBe('nav')
  })

  it('ir para o Início mostra as conversas', () => {
    expect(panelAfterNavigation(nav('/servers/s1/channels/a', '/'), 'content')).toBe('nav')
  })

  it('abrir uma DM ou Amigos pela lista abre a conversa', () => {
    expect(panelAfterNavigation(nav('/', '/dm/u1'), 'nav')).toBe('content')
    expect(panelAfterNavigation(nav('/dm/u1', '/friends'), 'nav')).toBe('content')
  })

  it('a aba do diamante não tem lista própria: o hub e as telas abrem direto', () => {
    expect(panelAfterNavigation(nav('/', '/melhorias'), 'nav')).toBe('content')
    expect(panelAfterNavigation(nav('/servers/s1/channels/a', '/changelog'), 'nav')).toBe('content')
    expect(panelAfterNavigation(nav('/', '/proposals?proposal=p1'), 'nav')).toBe('content')
  })

  it('do hub para uma tela (e de volta) fica no conteúdo', () => {
    expect(panelAfterNavigation(nav('/melhorias', '/ranking'), 'content')).toBe('content')
    expect(panelAfterNavigation(nav('/ranking', '/melhorias', 'POP'), 'content')).toBe('content')
  })

  it('sair da aba do diamante para o Início mostra as conversas', () => {
    expect(panelAfterNavigation(nav('/melhorias', '/'), 'content')).toBe('nav')
  })

  it('pular para uma DM de outro lugar (busca, notificação) abre a conversa', () => {
    expect(panelAfterNavigation(nav('/servers/s1/channels/a', '/dm/u1'), 'nav')).toBe('content')
    expect(panelAfterNavigation(nav('/', '/servers/s2/channels/b'), 'nav')).toBe('content')
  })
})

describe('shellPanelClasses', () => {
  it('na lista, o chat some só no celular', () => {
    const c = shellPanelClasses('nav')
    expect(c.content).toContain('max-md:hidden')
    expect(c.nav).not.toContain('max-md:hidden')
  })

  it('no chat, a lista some só no celular', () => {
    const c = shellPanelClasses('content')
    expect(c.nav).toContain('max-md:hidden')
    expect(c.content).not.toContain('max-md:hidden')
  })
})
