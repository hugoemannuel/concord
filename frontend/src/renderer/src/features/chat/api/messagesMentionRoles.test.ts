import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/api/client', () => ({ request }))

import { sendChannelMessage, sendConversationMessage } from './messages'

function bodyEnviado(): Record<string, unknown> {
  const [, init] = request.mock.calls.at(-1) as [string, { body: string }]
  return JSON.parse(init.body)
}

describe('cargos mencionados no envio', () => {
  beforeEach(() => {
    request.mockReset()
    request.mockResolvedValue({})
  })

  it('mensagem de canal leva mention_role_ids', async () => {
    await sendChannelMessage('ch1', '@suporte ajuda', [], null, { mentionRoleIds: ['r1', 'r2'] })
    expect(bodyEnviado().mention_role_ids).toEqual(['r1', 'r2'])
  })

  it('sem cargo marcado não manda o campo', async () => {
    await sendChannelMessage('ch1', 'oi', [], null, { mentionRoleIds: [] })
    expect('mention_role_ids' in bodyEnviado()).toBe(false)
    await sendChannelMessage('ch1', 'oi')
    expect('mention_role_ids' in bodyEnviado()).toBe(false)
  })

  it('DM e grupo não têm cargo: o campo não vai', async () => {
    await sendConversationMessage('c1', '@suporte', [], null, { mentionRoleIds: ['r1'] })
    expect('mention_role_ids' in bodyEnviado()).toBe(false)
  })
})
