import type { Message } from '../../chat/api/messages'
import { inAppNotificationFor } from './inAppNotification'

const me = { id: 'me', username: 'mugis' }
const msg = (over: Partial<Message>): Message => ({
  id: 'm1',
  author_id: 'u1',
  author: { id: 'u1', username: 'ana', display_name: 'Ana' } as Message['author'],
  content: 'oi',
  created_at: '2026-10-30T01:00:00Z',
  ...over
})

describe('inAppNotificationFor (aviso com o app aberto, como o Discord)', () => {
  it('DM de outra pessoa fora da conversa aberta: avisa com o nome e o texto, e o toque abre a DM', () => {
    const n = inAppNotificationFor({ message: msg({ conversation_id: 'c1' }) }, me, null)
    expect(n).toEqual({ title: 'Ana', body: 'oi', data: { type: 'dm', conversation_id: 'c1', name: 'Ana', in_app: true } })
  })

  it('com a conversa aberta na tela não avisa; mensagem minha também não', () => {
    expect(inAppNotificationFor({ message: msg({ conversation_id: 'c1' }) }, me, { kind: 'conversation', id: 'c1' })).toBeNull()
    expect(inAppNotificationFor({ message: msg({ conversation_id: 'c1', author_id: 'me' }) }, me, null)).toBeNull()
  })

  it('canal: só quando me citam (@meu_nome ou @all), mesma regra do push', () => {
    const channel = { channel_id: 'ch1' }
    expect(inAppNotificationFor({ message: msg({ ...channel, content: 'bom dia' }), server_id: 's1' }, me, null)).toBeNull()
    expect(inAppNotificationFor({ message: msg({ ...channel, content: 'olha @Mugis!' }), server_id: 's1' }, me, null)).toEqual({
      title: 'Ana',
      body: 'olha @Mugis!',
      data: { type: 'mention', channel_id: 'ch1', server_id: 's1', name: '', in_app: true }
    })
    expect(inAppNotificationFor({ message: msg({ ...channel, content: '@all reunião', mention_everyone: 'all' }) }, me, null)).not.toBeNull()
    expect(inAppNotificationFor({ message: msg({ ...channel, content: 'mande para x@mugis.com' }) }, me, null)).toBeNull()
    expect(inAppNotificationFor({ message: msg({ ...channel, content: '@mugis' }) }, me, { kind: 'channel', id: 'ch1' })).toBeNull()
  })

  it('@all e @everyone só avisam quando o servidor liberou (mention_everyone), não pelo texto', () => {
    const channel = { channel_id: 'ch1' }
    expect(inAppNotificationFor({ message: msg({ ...channel, content: '@all reunião' }) }, me, null)).toBeNull()
    expect(inAppNotificationFor({ message: msg({ ...channel, content: '@everyone reunião', mention_everyone: 'all' }) }, me, null)).not.toBeNull()
    // @here não avisa pelo celular, como o push.
    expect(inAppNotificationFor({ message: msg({ ...channel, content: '@here', mention_everyone: 'here' }) }, me, null)).toBeNull()
  })

  it('menção de um cargo meu avisa; de um cargo que não tenho, não', () => {
    const pinged = msg({ channel_id: 'ch1', content: '@suporte alguém?', mention_roles: [{ id: 'r1', handle: 'suporte' }] })
    expect(inAppNotificationFor({ message: pinged, server_id: 's1' }, me, null, ['r1'])).toEqual({
      title: 'Ana',
      body: '@suporte alguém?',
      data: { type: 'mention', channel_id: 'ch1', server_id: 's1', name: '', in_app: true }
    })
    expect(inAppNotificationFor({ message: pinged, server_id: 's1' }, me, null, ['outro'])).toBeNull()
    expect(inAppNotificationFor({ message: pinged, server_id: 's1' }, me, null)).toBeNull()
  })

  it('cargo pingado com o meu nick é o cargo, não eu', () => {
    const pinged = msg({ channel_id: 'ch1', content: 'chama o @Mugis', mention_roles: [{ id: 'r9', handle: 'mugis' }] })
    expect(inAppNotificationFor({ message: pinged }, me, null, [])).toBeNull()
    expect(inAppNotificationFor({ message: pinged }, me, null, ['r9'])).not.toBeNull()
    // Handle maior que começa com o meu nick também não sou eu.
    const equipe = msg({ channel_id: 'ch1', content: '@mugis-time', mention_roles: [{ id: 'r8', handle: 'mugis-time' }] })
    expect(inAppNotificationFor({ message: equipe }, me, null, [])).toBeNull()
  })

  it('sem texto (anexo, GIF, figurinha) usa uma descrição curta; texto longo é cortado', () => {
    expect(inAppNotificationFor({ message: msg({ conversation_id: 'c1', content: '' }) }, me, null)?.body).toBe('Enviou um anexo')
    const long = 'a'.repeat(300)
    expect(inAppNotificationFor({ message: msg({ conversation_id: 'c1', content: long }) }, me, null)?.body).toHaveLength(140)
  })

  it('mensagem do sistema (Maestro) não avisa', () => {
    expect(inAppNotificationFor({ message: msg({ conversation_id: 'c1', system_kind: 'music' }) }, me, null)).toBeNull()
  })
})
