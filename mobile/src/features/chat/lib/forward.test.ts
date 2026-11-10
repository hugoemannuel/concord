import { forwardedLabel } from './forward'

const base = { message_id: 'm0', author_id: 'ana', author_name: 'Ana', created_at: '' }

describe('forwardedLabel', () => {
  it('canal com servidor, canal sem servidor e DM', () => {
    expect(forwardedLabel({ ...base, channel_id: 'c1', channel_name: 'geral', server_name: 'Salinha' })).toBe('de Ana · #geral · Salinha')
    expect(forwardedLabel({ ...base, channel_id: 'c1', channel_name: 'geral' })).toBe('de Ana · #geral')
    expect(forwardedLabel({ ...base, conversation_id: 'dm1' })).toBe('de Ana · Mensagem direta')
  })

  it('sem nome: o @usuário, ou "Alguém"', () => {
    expect(forwardedLabel({ ...base, author_name: '', author_username: 'ana', conversation_id: 'd' })).toBe('de ana · Mensagem direta')
    expect(forwardedLabel({ ...base, author_name: '', conversation_id: 'd' })).toBe('de Alguém · Mensagem direta')
  })
})
