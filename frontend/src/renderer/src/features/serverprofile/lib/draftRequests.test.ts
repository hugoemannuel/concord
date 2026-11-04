import { beforeEach, describe, expect, it, vi } from 'vitest'

const toastError = vi.hoisted(() => vi.fn())
const api = vi.hoisted(() => ({
  applyServerTag: vi.fn(),
  clearServerTag: vi.fn(),
  updateServerProfile: vi.fn(),
  uploadServerProfileImage: vi.fn()
}))
vi.mock('../../../shared/store/toastStore', () => ({ showToast: { error: toastError } }))
vi.mock('../api/serverProfile', () => api)
vi.mock('../../appearance/lib/themeImageFile', () => ({
  imageFileProblem: (f: { type: string }) => (f.type === 'image/png' ? null : 'Tipo ruim'),
  shrinkImage: async (f: Blob) => f
}))

import { chooseMyTag, savePatch, uploadPicked } from './draftRequests'

beforeEach(() => {
  toastError.mockReset()
  Object.values(api).forEach((fn) => fn.mockReset())
})

describe('savePatch', () => {
  it('devolve o cartão; erro vira aviso', async () => {
    api.updateServerProfile.mockResolvedValueOnce({ locked: false })
    await expect(savePatch('s', {})).resolves.toEqual({ locked: false })
    api.updateServerProfile.mockRejectedValueOnce(new Error('fora'))
    await expect(savePatch('s', {})).resolves.toBeNull()
    expect(toastError).toHaveBeenCalled()
  })
})

describe('uploadPicked', () => {
  const png = new File(['x'], 'a.png', { type: 'image/png' })
  it('envia e devolve a URL', async () => {
    api.uploadServerProfileImage.mockResolvedValue('/api/x')
    await expect(uploadPicked('s', png)).resolves.toBe('/api/x')
  })
  it('tipo ruim nem envia', async () => {
    await expect(uploadPicked('s', new File(['x'], 'a.gif', { type: 'image/gif' }))).resolves.toBeNull()
    expect(api.uploadServerProfileImage).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith('Tipo ruim')
  })
  it('falhou: avisa', async () => {
    api.uploadServerProfileImage.mockRejectedValue(new Error('fora'))
    await expect(uploadPicked('s', png)).resolves.toBeNull()
    expect(toastError).toHaveBeenCalled()
  })
})

describe('chooseMyTag', () => {
  it('aplica ou tira', async () => {
    const tag = { server_id: 's', name: 'A', badge: 'raio', color: '#000000' }
    api.applyServerTag.mockResolvedValue({ tag })
    await expect(chooseMyTag('s')).resolves.toBe(tag)
    await expect(chooseMyTag(null)).resolves.toBeNull()
    expect(api.clearServerTag).toHaveBeenCalled()
  })
})
