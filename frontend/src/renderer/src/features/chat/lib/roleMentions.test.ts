import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  mentionsHandle,
  picksInText,
  roleChipView,
  roleHandle,
  roleIdsToSend,
  roleSuggestions,
  splitRoleMentions,
  withoutRoleMentions,
  withRolePick,
  type MentionableRole
} from './roleMentions'

interface Vectors {
  handles: { name: string; handle: string }[]
  tokens: { content: string; handle: string; mentioned: boolean }[]
}

// Os mesmos casos rodam no backend (internal/message/mention_role_test.go).
const vectors: Vectors = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../../../backend/internal/message/testdata/role_mentions.json',
      import.meta.url
    ),
    'utf8'
  )
)

const role = (id: string, name: string, extra: Partial<MentionableRole> = {}): MentionableRole => ({
  id,
  name,
  color: null,
  position: 1,
  mentionable: false,
  is_default: false,
  ...extra
})

// Suporte é aberto a todos; Equipe de Suporte, só para quem tem a permissão.
const ROLES: MentionableRole[] = [
  role('everyone', '@everyone', { is_default: true, position: 0, mentionable: true }),
  role('bots', 'Bots', { is_system: true, mentionable: true }),
  role('suporte', 'Suporte', { mentionable: true, position: 3, color: 0x3366ff }),
  role('equipe', 'Equipe de Suporte', { position: 4 }),
  role('mod', 'Moderação', { mentionable: true, position: 5 }),
  role('todos', 'All', { mentionable: true }),
  role('fogo', '🔥', { mentionable: true })
]

describe('roleHandle', () => {
  it.each(vectors.handles)('"$name" vira "$handle"', ({ name, handle }) => {
    expect(roleHandle(name)).toBe(handle)
  })
})

describe('mentionsHandle', () => {
  it.each(vectors.tokens)('"$content" menciona $handle? $mentioned', (c) => {
    expect(mentionsHandle(c.content, c.handle)).toBe(c.mentioned)
  })

  it('sem handle nunca menciona', () => {
    expect(mentionsHandle('@ oi', '')).toBe(false)
  })
})

describe('roleSuggestions', () => {
  const names = (query: string, canMentionAny: boolean): string[] =>
    roleSuggestions(query, ROLES, canMentionAny).map((s) => s.name)

  it('membro comum só vê os cargos abertos, do mais alto para o mais baixo', () => {
    expect(names('', false)).toEqual(['Moderação', 'Suporte'])
  })

  it('quem tem a permissão vê todos, menos os fixos, os sem handle e os de nome reservado', () => {
    expect(names('', true)).toEqual(['Moderação', 'Equipe de Suporte', 'Suporte'])
  })

  it('busca pelo começo do nome ou do handle, sem diferenciar acento nem caixa', () => {
    expect(names('MODERA', false)).toEqual(['Moderação'])
    expect(names('moderaca', false)).toEqual(['Moderação'])
    expect(names('equipe-de', true)).toEqual(['Equipe de Suporte'])
    expect(names('su', true)).toEqual(['Suporte'])
    expect(names('zzz', true)).toEqual([])
  })

  it('a sugestão leva o handle (o que vai para o texto), o id e a cor', () => {
    expect(roleSuggestions('sup', ROLES, false)).toEqual([
      { kind: 'role', username: 'suporte', id: 'suporte', name: 'Suporte', color: 0x3366ff }
    ])
  })

  it('respeita o limite', () => {
    expect(roleSuggestions('', ROLES, true, 2)).toHaveLength(2)
  })
})

describe('roleIdsToSend', () => {
  const send = (
    text: string,
    opts: { picks?: Record<string, string>; usernames?: string[]; canMentionAny?: boolean } = {}
  ): string[] =>
    roleIdsToSend(text, opts.picks ?? {}, ROLES, opts.usernames ?? [], opts.canMentionAny ?? false)

  it('cargo escolhido na lista e ainda no texto vai', () => {
    expect(send('@suporte ajuda', { picks: { suporte: 'suporte' } })).toEqual(['suporte'])
  })

  it('escolha cujo @handle saiu do texto não vai', () => {
    expect(send('deixa pra lá', { picks: { suporte: 'suporte' } })).toEqual([])
  })

  it('escrito à mão, sem escolher, o app resolve pelo nome', () => {
    expect(send('@suporte e @moderação')).toEqual(['mod', 'suporte'])
  })

  it('escrito à mão com um membro de mesmo nick: vale a pessoa', () => {
    expect(send('@suporte', { usernames: ['Suporte'] })).toEqual([])
  })

  it('escolhido na lista vale mesmo com um membro de mesmo nick', () => {
    expect(send('@suporte', { picks: { suporte: 'suporte' }, usernames: ['suporte'] })).toEqual([
      'suporte'
    ])
  })

  it('cargo fechado só vai para quem tem a permissão', () => {
    expect(send('@equipe-de-suporte')).toEqual([])
    expect(send('@equipe-de-suporte', { canMentionAny: true })).toEqual(['equipe'])
  })

  it('escolha de um cargo que a pessoa não pode mencionar é descartada', () => {
    expect(send('@equipe-de-suporte', { picks: { 'equipe-de-suporte': 'equipe' } })).toEqual([])
  })

  it('dois cargos com o mesmo handle: o escolhido; sem escolha, o mais alto', () => {
    const roles = [role('baixo', 'Dev', { mentionable: true, position: 1 }), role('alto', 'DEV', { mentionable: true, position: 2 })]
    expect(roleIdsToSend('@dev', {}, roles, [], false)).toEqual(['alto'])
    expect(roleIdsToSend('@dev', { dev: 'baixo' }, roles, [], false)).toEqual(['baixo'])
  })

  it('cargos fixos, sem handle e de nome reservado nunca vão', () => {
    expect(send('@all @bots @everyone', { canMentionAny: true })).toEqual([])
  })

  it('@handle dentro de código não vai', () => {
    expect(send('`@suporte`', { picks: { suporte: 'suporte' } })).toEqual([])
  })
})

describe('splitRoleMentions', () => {
  const pinged = [
    { id: 'r1', handle: 'suporte' },
    { id: 'r2', handle: 'equipe-de-suporte' }
  ]

  it('separa o @handle dos cargos pingados do resto do texto', () => {
    expect(splitRoleMentions('oi @Suporte, e @equipe-de-suporte!', pinged)).toEqual([
      { text: 'oi ' },
      { text: '@Suporte', role: 'r1' },
      { text: ', e ' },
      { text: '@equipe-de-suporte', role: 'r2' },
      { text: '!' }
    ])
  })

  it('o que não é o handle inteiro continua texto', () => {
    expect(splitRoleMentions('@suportes x.com/@suporte', pinged)).toEqual([
      { text: '@suportes x.com/@suporte' }
    ])
  })

  it('sem cargo pingado, o texto volta inteiro', () => {
    expect(splitRoleMentions('@suporte', [])).toEqual([{ text: '@suporte' }])
  })

  it('texto que é só a menção', () => {
    expect(splitRoleMentions('@suporte', pinged)).toEqual([{ text: '@suporte', role: 'r1' }])
  })
})

describe('withoutRoleMentions', () => {
  it('tira o @handle do cargo pingado (não é a pessoa de mesmo nick)', () => {
    expect(withoutRoleMentions('oi @Suporte e @ana', [{ id: 'r1', handle: 'suporte' }])).toBe(
      'oi   e @ana'
    )
  })

  it('sem cargo pingado, devolve o mesmo texto', () => {
    expect(withoutRoleMentions('oi @suporte', null)).toBe('oi @suporte')
    expect(withoutRoleMentions('oi @suporte', [])).toBe('oi @suporte')
  })
})

describe('withRolePick', () => {
  const cargo = { kind: 'role', username: 'suporte', id: 'r1', name: 'Suporte', color: null } as const

  it('escolher um cargo guarda o id pelo handle', () => {
    expect(withRolePick({}, cargo)).toEqual({ suporte: 'r1' })
    expect(withRolePick({ suporte: 'outro' }, cargo)).toEqual({ suporte: 'r1' })
  })

  it('escolher a pessoa de mesmo nick desfaz a escolha do cargo', () => {
    expect(withRolePick({ suporte: 'r1', mod: 'r2' }, { kind: 'user', username: 'Suporte' })).toEqual({
      mod: 'r2'
    })
  })

  it('escolher outra pessoa (ou @all) não mexe nas escolhas', () => {
    const picks = { suporte: 'r1' }
    expect(withRolePick(picks, { kind: 'user', username: 'ana' })).toBe(picks)
    expect(withRolePick(picks, { kind: 'everyone', username: 'all' })).toBe(picks)
  })
})

describe('picksInText', () => {
  const picks = { suporte: 'r1', 'equipe-de-suporte': 'r2' }

  it('fica só a escolha cujo @handle ainda está no texto', () => {
    expect(picksInText(picks, 'oi @suporte')).toEqual({ suporte: 'r1' })
    expect(picksInText(picks, '')).toEqual({})
  })

  it('apagar um pedaço do handle já desfaz a escolha (redigitar à mão não é escolher)', () => {
    expect(picksInText({ suporte: 'r1' }, 'oi @suport')).toEqual({})
  })

  it('nada a tirar: devolve o mesmo objeto (o estado não muda à toa)', () => {
    expect(picksInText(picks, '@suporte e @equipe-de-suporte')).toBe(picks)
  })
})

describe('roleChipView', () => {
  it('cargo conhecido: o nome atual e a cor', () => {
    expect(roleChipView({ name: 'Suporte Novo', color: 0x3366ff }, '@suporte')).toEqual({
      label: '@Suporte Novo',
      color: '#3366ff'
    })
  })

  it('cargo sem cor: só o nome', () => {
    expect(roleChipView({ name: 'Suporte', color: null }, '@suporte')).toEqual({
      label: '@Suporte',
      color: undefined
    })
  })

  it('cargo apagado ou desconhecido: o texto como foi escrito', () => {
    expect(roleChipView(undefined, '@suporte')).toEqual({ label: '@suporte', color: undefined })
  })
})
