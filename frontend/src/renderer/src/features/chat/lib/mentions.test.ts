import { describe, expect, it } from 'vitest'
import {
  applyMention,
  everyonePingsMe,
  everyoneSuggestions,
  mentionChipText,
  mentionLabels,
  mentionQuery,
  mentionSuggestions,
  keepSameLabels,
  messageMentionsMe,
  sameLabels,
  mentionsUser,
  splitMentions
} from './mentions'

describe('mentionsUser', () => {
  it('reconhece @nick no começo, no meio e com pontuação', () => {
    expect(mentionsUser('@fulano bora?', 'fulano')).toBe(true)
    expect(mentionsUser('valeu @fulano!', 'fulano')).toBe(true)
    expect(mentionsUser('ei @FULANO', 'fulano')).toBe(true)
  })

  it('não confunde com nick maior, e-mail ou texto sem @', () => {
    expect(mentionsUser('@fulano2 oi', 'fulano')).toBe(false)
    expect(mentionsUser('fulano@fulano.com', 'fulano')).toBe(false)
    expect(mentionsUser('fulano sem arroba', 'fulano')).toBe(false)
  })

  it('não conta @nick dentro de link', () => {
    expect(mentionsUser('x.com/@fulano', 'fulano')).toBe(false)
    expect(mentionsUser('https://medium.com/@fulano', 'fulano')).toBe(false)
    expect(mentionsUser('(@fulano)', 'fulano')).toBe(true)
  })

  it('depois do nick só vale fim, espaço ou pontuação de fechamento', () => {
    for (const ok of [
      '@fulano, oi',
      '@fulano!',
      '@fulano?',
      '@fulano: bora',
      '@fulano;',
      '@fulano...',
      '[@fulano]',
      '{@fulano}',
      '"@fulano"',
      "'@fulano'",
      '“@fulano”',
      '‘@fulano’',
      '«@fulano»',
      '<@fulano>',
      '*@fulano*',
      '~@fulano~',
      "@fulano'"
    ]) {
      expect(mentionsUser(ok, 'fulano'), ok).toBe(true)
    }
    for (const no of [
      '@fulano-hands',
      "@fulano's",
      '@fulano’s',
      '@fulano1',
      '@fulano@x',
      '@fulano/x',
      '@fulanoé',
      '@fulano.bot',
      '@fulano.-'
    ]) {
      expect(mentionsUser(no, 'fulano'), no).toBe(false)
    }
  })

  it('quem se chama all, here ou everyone só é pingado pelo mention_everyone', () => {
    expect(mentionsUser('@all bora', 'all')).toBe(false)
    expect(mentionsUser('@HERE alguém?', 'here')).toBe(false)
    expect(mentionsUser('@everyone', 'Everyone')).toBe(false)
  })
})

describe('splitMentions', () => {
  it('separa as menções do texto para destacar', () => {
    expect(splitMentions('oi @ana e @bia_2!')).toEqual([
      { text: 'oi ' },
      { text: '@ana', mention: 'ana' },
      { text: ' e ' },
      { text: '@bia_2', mention: 'bia_2' },
      { text: '!' }
    ])
  })

  it('texto sem menção fica inteiro', () => {
    expect(splitMentions('sem nada')).toEqual([{ text: 'sem nada' }])
  })

  it('@all/@here sem mention_everyone ficam como texto puro', () => {
    expect(splitMentions('oi @all e @here')).toEqual([{ text: 'oi @all e @here' }])
    expect(splitMentions('@all @ana', null)).toEqual([
      { text: '@all ' },
      { text: '@ana', mention: 'ana' }
    ])
  })

  it('destaca @all/@here só quando bate com o mention_everyone da mensagem', () => {
    expect(splitMentions('ei @ALL, bora', 'all')).toEqual([
      { text: 'ei ' },
      { text: '@ALL', mention: 'all' },
      { text: ', bora' }
    ])
    expect(splitMentions('@here e @all', 'here')).toEqual([
      { text: '@here', mention: 'here' },
      { text: ' e @all' }
    ])
  })

  it('@ no meio de link não vira menção, nem com mention_everyone', () => {
    expect(splitMentions('x.com/@all', 'all')).toEqual([{ text: 'x.com/@all' }])
    expect(splitMentions('https://medium.com/@here', 'here')).toEqual([
      { text: 'https://medium.com/@here' }
    ])
    expect(splitMentions('veja x.com/@ana')).toEqual([{ text: 'veja x.com/@ana' }])
    expect(splitMentions('<@all>', 'all')).toEqual([
      { text: '<' },
      { text: '@all', mention: 'all' },
      { text: '>' }
    ])
    expect(splitMentions('["@ana"]')).toEqual([
      { text: '["' },
      { text: '@ana', mention: 'ana' },
      { text: '"]' }
    ])
  })

  it("@all-hands, @all's e afins não viram menção", () => {
    expect(splitMentions('@all-hands amanhã', 'all')).toEqual([{ text: '@all-hands amanhã' }])
    expect(splitMentions("@all's fine", 'all')).toEqual([{ text: "@all's fine" }])
    expect(splitMentions('@here’s', 'here')).toEqual([{ text: '@here’s' }])
    expect(splitMentions('@ana-bia oi')).toEqual([{ text: '@ana-bia oi' }])
    expect(splitMentions('@all-hands e @here!', 'here')).toEqual([
      { text: '@all-hands e ' },
      { text: '@here', mention: 'here' },
      { text: '!' }
    ])
    expect(splitMentions('@all, bora', 'all')).toEqual([
      { text: '@all', mention: 'all' },
      { text: ', bora' }
    ])
    expect(splitMentions('‘@ana’')).toEqual([
      { text: '‘' },
      { text: '@ana', mention: 'ana' },
      { text: '’' }
    ])
  })

  it('@everyone não é menção de ninguém', () => {
    expect(splitMentions('oi @everyone')).toEqual([{ text: 'oi @everyone' }])
  })
})

describe('everyonePingsMe', () => {
  it('@all pinga qualquer status', () => {
    for (const status of ['online', 'idle', 'dnd', 'invisible', undefined] as const) {
      expect(everyonePingsMe('all', status)).toBe(true)
    }
  })

  it('@here só pinga quem aparece online (ausente e invisível ficam de fora)', () => {
    expect(everyonePingsMe('here', 'online')).toBe(true)
    expect(everyonePingsMe('here', 'dnd')).toBe(true)
    expect(everyonePingsMe('here', undefined)).toBe(true)
    expect(everyonePingsMe('here', 'idle')).toBe(false)
    expect(everyonePingsMe('here', 'invisible')).toBe(false)
  })

  it('sem mention_everyone, não pinga', () => {
    expect(everyonePingsMe(null, 'online')).toBe(false)
    expect(everyonePingsMe(undefined, 'online')).toBe(false)
  })
})

describe('everyoneSuggestions', () => {
  it('quem pode vê @all e @here, filtrados pelo que foi digitado', () => {
    expect(everyoneSuggestions('', true)).toEqual([
      { username: 'all', description: 'Notifica todos do canal' },
      { username: 'here', description: 'Notifica quem está online' }
    ])
    expect(everyoneSuggestions('H', true)).toEqual([
      { username: 'here', description: 'Notifica quem está online' }
    ])
    expect(everyoneSuggestions('al', true).map((s) => s.username)).toEqual(['all'])
    expect(everyoneSuggestions('ana', true)).toEqual([])
  })

  it('quem não pode não vê nenhuma', () => {
    expect(everyoneSuggestions('', false)).toEqual([])
  })
})

describe('mentionQuery', () => {
  it('detecta o @ sendo digitado antes do cursor', () => {
    expect(mentionQuery('fala @ni', 8)).toEqual({ query: 'ni', start: 5 })
    expect(mentionQuery('@', 1)).toEqual({ query: '', start: 0 })
  })

  it('sem @ logo antes do cursor (ou com espaço no meio), nada', () => {
    expect(mentionQuery('fala ni', 7)).toBeNull()
    expect(mentionQuery('@ana já foi', 11)).toBeNull()
    expect(mentionQuery('email@x', 7)).toBeNull()
  })
})

describe('applyMention', () => {
  it('troca o que foi digitado pelo @nick e um espaço', () => {
    expect(applyMention('fala @ni tudo bem', 5, 8, 'fulano')).toEqual({
      text: 'fala @fulano  tudo bem',
      caret: 13
    })
  })
})

describe('messageMentionsMe', () => {
  const me = { id: 'eu', username: 'fulano' }
  const msg = (
    over: Partial<Parameters<typeof messageMentionsMe>[0]> = {}
  ): Parameters<typeof messageMentionsMe>[0] => ({
    author_id: 'ana',
    content: 'oi',
    reply_to: null,
    mention_everyone: null,
    ...over
  })

  it('@nick, resposta minha e @all/@here liberados destacam a linha', () => {
    expect(messageMentionsMe(msg({ content: 'oi @fulano' }), me)).toBe(true)
    expect(messageMentionsMe(msg({ reply_to: { author_id: 'eu' } }), me)).toBe(true)
    expect(messageMentionsMe(msg({ content: '@all', mention_everyone: 'all' }), me)).toBe(true)
    expect(messageMentionsMe(msg({ content: '@here', mention_everyone: 'here' }), me)).toBe(true)
  })

  it('"@all" sem mention_everyone, mensagem minha ou sem eu logado, não destaca', () => {
    expect(messageMentionsMe(msg({ content: '@all' }), me)).toBe(false)
    expect(
      messageMentionsMe(msg({ author_id: 'eu', content: '@all', mention_everyone: 'all' }), me)
    ).toBe(false)
    expect(messageMentionsMe(msg({ content: '@fulano' }), null)).toBe(false)
  })
})

describe('mentionSuggestions', () => {
  const users = [
    { username: 'ana', display_name: 'Ana' },
    { username: 'alice', display_name: 'Alice' },
    { username: 'hugo', display_name: 'Hugo' }
  ]
  const names = (r: ReturnType<typeof mentionSuggestions>): string[] =>
    r.items.map((i) => `${i.kind}:${i.username}`)

  it('só "@": nada de @all/@here, o padrão é a primeira pessoa', () => {
    const r = mentionSuggestions('', users, true)
    expect(names(r)).toEqual(['user:ana', 'user:alice', 'user:hugo'])
    expect(r.defaultIndex).toBe(0)
  })

  it('"@a"/"@h": @all/@here no topo, mas o padrão continua sendo uma pessoa', () => {
    const a = mentionSuggestions('a', users, true)
    expect(names(a)).toEqual(['everyone:all', 'user:ana', 'user:alice'])
    expect(a.defaultIndex).toBe(1)
    const h = mentionSuggestions('H', users, true)
    expect(names(h)).toEqual(['everyone:here', 'user:hugo'])
    expect(h.defaultIndex).toBe(1)
  })

  it('só @all/@here batem: aparecem e o padrão é o que foi digitado', () => {
    const r = mentionSuggestions('al', [{ username: 'bia', display_name: 'Bia' }], true)
    expect(names(r)).toEqual(['everyone:all'])
    expect(r.defaultIndex).toBe(0)
  })

  it('só "@" e ninguém mais bate: @all/@here aparecem, mas sem padrão', () => {
    const r = mentionSuggestions('', [], true)
    expect(names(r)).toEqual(['everyone:all', 'everyone:here'])
    expect(r.defaultIndex).toBe(-1)
  })

  it('sem permissão, só pessoas', () => {
    expect(names(mentionSuggestions('a', users, false))).toEqual(['user:ana', 'user:alice'])
    expect(mentionSuggestions('', [], false)).toEqual({ items: [], defaultIndex: -1 })
  })

  it('esconde eu mesmo e quem se chama all/here/everyone', () => {
    const r = mentionSuggestions(
      '',
      [
        ...users,
        { username: 'All', display_name: 'All' },
        { username: 'everyone', display_name: 'E' }
      ],
      false,
      { exclude: 'ana' }
    )
    expect(names(r)).toEqual(['user:alice', 'user:hugo'])
  })

  it('casa pelo nick ou pelo nome e respeita o limite', () => {
    const r = mentionSuggestions('hu', [{ username: 'x1', display_name: 'Hugo' }], false)
    expect(names(r)).toEqual(['user:x1'])
    expect(mentionSuggestions('', users, false, { max: 2 }).items).toHaveLength(2)
  })

  it('casa também pelo apelido no servidor e insere o @ de verdade', () => {
    const members = [
      { username: 'caio', display_name: 'Caio Lúcio', nickname: 'Capitão' },
      { username: 'bia', display_name: 'Beatriz', nickname: null }
    ]
    const r = mentionSuggestions('cap', members, false)
    expect(r.items).toEqual([
      { kind: 'user', username: 'caio', display_name: 'Caio Lúcio', nickname: 'Capitão' }
    ])
    // Escolher a sugestão escreve o @username, não o apelido.
    const pick = r.items[r.defaultIndex]
    expect(applyMention('oi @cap', 3, 7, pick.username).text).toBe('oi @caio ')
  })

  it('com apelido, o nome e o @ continuam valendo', () => {
    const members = [{ username: 'caio', display_name: 'Caio Lúcio', nickname: 'Capitão' }]
    expect(names(mentionSuggestions('cai', members, false))).toEqual(['user:caio'])
    expect(names(mentionSuggestions('CAIO L', members, false))).toEqual(['user:caio'])
    expect(names(mentionSuggestions('zz', members, false))).toEqual([])
  })

  it('apelido vazio não casa com tudo', () => {
    const members = [{ username: 'x1', display_name: 'Xis', nickname: '' }]
    expect(names(mentionSuggestions('q', members, false))).toEqual([])
  })
})

describe('mentionLabels / mentionChipText', () => {
  const people = [
    { username: 'ana', display_name: 'Ana Souza', nickname: 'Aninha' },
    { username: 'bia', display_name: 'Bia', nickname: null },
    { username: 'caio', display_name: '', nickname: '  ' }
  ]
  const labels = mentionLabels(people)
  const chip = (text: string): string => {
    const part = splitMentions(text).find((p) => p.mention)
    return part ? mentionChipText(part, labels) : text
  }

  it('servidor: apelido; sem apelido, nome de exibição; nunca o @username', () => {
    expect(chip('oi @ana')).toBe('@Aninha')
    expect(chip('oi @bia')).toBe('@Bia')
  })

  it('DM (sem apelido): nome de exibição', () => {
    const dm = mentionLabels([{ username: 'bia', display_name: 'Bia Lima' }])
    const part = splitMentions('@bia')[0]
    expect(mentionChipText(part, dm)).toBe('@Bia Lima')
  })

  it('sem nada além do nick, sobra o @nick', () => {
    expect(chip('@caio')).toBe('@caio')
  })

  it('casa sem diferenciar maiúsculas', () => {
    expect(chip('@ANA')).toBe('@Aninha')
  })

  it('quem não é conhecido (saiu do servidor) fica como no texto', () => {
    expect(chip('@fulano')).toBe('@fulano')
  })

  it('@all/@here não são trocados, nem por quem tem esse nick', () => {
    const l = mentionLabels([{ username: 'all', display_name: 'Todo Mundo' }])
    const part = splitMentions('@all', 'all')[0]
    expect(mentionChipText(part, l)).toBe('@all')
  })

  it('texto comum e mapa ausente ficam intactos', () => {
    expect(mentionChipText({ text: 'oi' }, labels)).toBe('oi')
    expect(mentionChipText({ text: '@ana', mention: 'ana' }, undefined)).toBe('@ana')
  })

  it('o primeiro da lista vence nick repetido', () => {
    const l = mentionLabels([
      { username: 'ana', display_name: 'Primeira' },
      { username: 'ANA', display_name: 'Segunda' }
    ])
    expect(l.ana).toBe('Primeira')
  })

  it('sameLabels compara por conteúdo', () => {
    expect(sameLabels({ a: 'A' }, { a: 'A' })).toBe(true)
    expect(sameLabels({ a: 'A' }, { a: 'B' })).toBe(false)
    expect(sameLabels({ a: 'A' }, { a: 'A', b: 'B' })).toBe(false)
    expect(sameLabels(undefined, {})).toBe(false)
  })

  it('keepSameLabels devolve o objeto anterior quando os nomes não mudaram', () => {
    const before = { ana: 'Ana' }
    expect(keepSameLabels(before, { ana: 'Ana' })).toBe(before)
    const changed = { ana: 'Ana', bia: 'Bia' }
    expect(keepSameLabels(before, changed)).toBe(changed)
    expect(keepSameLabels(undefined, changed)).toBe(changed)
  })
})
