import { describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/api/client', () => ({ request }))

import { openViewOnce } from './viewOnce'

describe('openViewOnce', () => {
  it('faz POST em /attachments/:id/open e devolve o token', async () => {
    request.mockResolvedValue({ token: 't', expires_at: 'x' })
    await expect(openViewOnce('a 1')).resolves.toEqual({ token: 't', expires_at: 'x' })
    expect(request).toHaveBeenCalledWith('/attachments/a%201/open', { method: 'POST' })
  })
})
