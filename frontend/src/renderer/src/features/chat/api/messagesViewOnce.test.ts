import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/api/client', () => ({ request }))

import { sendConversationMessage } from './messages'

function bodyEnviado(): Record<string, unknown> {
  const [, init] = request.mock.calls.at(-1) as [string, { body: string }]
  return JSON.parse(init.body)
}

describe('sendConversationMessage com visualização única', () => {
  beforeEach(() => {
    request.mockReset()
    request.mockResolvedValue({})
  })

  it('viewOnce: true manda view_once: true', async () => {
    await sendConversationMessage('c1', '', ['a1'], null, { viewOnce: true })
    expect(bodyEnviado().view_once).toBe(true)
  })

  it('sem a flag não manda o campo', async () => {
    await sendConversationMessage('c1', 'oi', [], null, {})
    await sendConversationMessage('c1', 'oi')
    expect('view_once' in bodyEnviado()).toBe(false)
  })
})
