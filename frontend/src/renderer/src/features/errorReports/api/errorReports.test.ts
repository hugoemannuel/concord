import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.fn()
vi.mock('../../../shared/api/client', () => ({ request: (...args: unknown[]) => request(...args) }))

import { getErrorGroup, getErrorGroups, postErrors } from './errorReports'

describe('api do relatório de erros', () => {
  beforeEach(() => request.mockReset().mockResolvedValue(undefined))

  it('postErrors manda contexto e erros', async () => {
    const context = { os: 'Linux', app_version: '1.4.2', target: 'desktop' as const }
    await postErrors(context, [])
    expect(request).toHaveBeenCalledWith('/obs/errors', {
      method: 'POST',
      body: JSON.stringify({ context, errors: [] })
    })
  })

  it('getErrorGroups leva só os filtros preenchidos', async () => {
    await getErrorGroups(7)
    expect(request).toHaveBeenLastCalledWith('/obs/errors?days=7')
    await getErrorGroups(14, 'main', '1.4.2')
    expect(request).toHaveBeenLastCalledWith('/obs/errors?days=14&source=main&version=1.4.2')
  })

  it('getErrorGroup pede o grupo pela impressão digital', async () => {
    await getErrorGroup('9f1c', 3)
    expect(request).toHaveBeenLastCalledWith('/obs/errors/9f1c?days=3')
  })
})
