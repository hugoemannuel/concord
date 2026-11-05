import { describe, expect, it } from 'vitest'
import { inviteEmbedView } from './inviteEmbedView'

const preview = { name: 'Salinha', member_count: 3, online_count: 1, server_id: 's1' }

describe('inviteEmbedView', () => {
  it('sem resposta ainda: carregando', () => {
    expect(inviteEmbedView(undefined, false, [])).toEqual({ kind: 'loading' })
    expect(inviteEmbedView({ status: 'loading' }, false, [])).toEqual({ kind: 'loading' })
  })

  it('erro: convite inválido com o motivo', () => {
    const view = inviteEmbedView({ status: 'error', message: 'expirou', retry: false }, false, [])
    expect(view).toEqual({ kind: 'invalid', hint: 'expirou' })
  })

  it('quem recebeu e não é membro: título de convidado e botão Entrar', () => {
    expect(inviteEmbedView({ status: 'ready', preview }, false, [])).toEqual({
      kind: 'ready',
      title: 'Você foi convidado(a) para entrar num servidor',
      preview,
      action: 'join'
    })
  })

  it('quem mandou vê o título de enviado', () => {
    const view = inviteEmbedView({ status: 'ready', preview }, true, [])
    expect(view).toMatchObject({ title: 'Você enviou um convite para um servidor' })
  })

  it('já é membro (pelo servidor ou pela lista local): Ir para o servidor', () => {
    const member = { ...preview, is_member: true }
    expect(inviteEmbedView({ status: 'ready', preview: member }, false, [])).toMatchObject({
      action: 'open'
    })
    expect(inviteEmbedView({ status: 'ready', preview }, false, ['s1'])).toMatchObject({
      action: 'open'
    })
  })
})
