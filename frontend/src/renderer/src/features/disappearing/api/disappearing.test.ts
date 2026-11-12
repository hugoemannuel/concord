import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/api/client', () => ({ request }))

import { setDisappearing } from './disappearing'

describe('setDisappearing', () => {
  beforeEach(() => {
    request.mockReset()
    request.mockResolvedValue(undefined)
  })

  it('faz PUT com { seconds }', async () => {
    await setDisappearing('c 1', 86400)
    expect(request).toHaveBeenCalledWith('/conversations/c%201/disappearing', {
      method: 'PUT',
      body: JSON.stringify({ seconds: 86400 })
    })
  })

  it('null desativa', async () => {
    await setDisappearing('c1', null)
    expect(request.mock.calls[0][1].body).toBe('{"seconds":null}')
  })
})
