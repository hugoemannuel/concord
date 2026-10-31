import { describe, expect, it, vi } from 'vitest'
import { PendingDisplayRequest } from './displayPicker'

describe('PendingDisplayRequest', () => {
  it('cancelar recusa com null (nunca {}, que derruba o processo main)', () => {
    const pending = new PendingDisplayRequest()
    const callback = vi.fn()
    pending.hold(callback)

    pending.deny()

    expect(callback).toHaveBeenCalledExactlyOnceWith(null)
  })

  it('só existe pedido pendente entre o getDisplayMedia e a resposta', () => {
    const pending = new PendingDisplayRequest()
    expect(pending.pending()).toBe(false)
    pending.hold(vi.fn())
    expect(pending.pending()).toBe(true)
    pending.take()
    expect(pending.pending()).toBe(false)
  })

  it('a resposta é entregue uma única vez', () => {
    const pending = new PendingDisplayRequest()
    const callback = vi.fn()
    pending.hold(callback)

    expect(pending.take()).toBe(callback)
    expect(pending.take()).toBeNull()
    pending.deny()
    expect(callback).not.toHaveBeenCalled()
  })

  it('um pedido novo recusa o anterior que ficou sem resposta', () => {
    const pending = new PendingDisplayRequest()
    const first = vi.fn()
    const second = vi.fn()
    pending.hold(first)

    pending.hold(second)

    expect(first).toHaveBeenCalledExactlyOnceWith(null)
    expect(second).not.toHaveBeenCalled()
    expect(pending.take()).toBe(second)
  })

  it('cancelar sem pedido pendente não faz nada', () => {
    expect(() => new PendingDisplayRequest().deny()).not.toThrow()
  })

  it('se o Electron lançar ao recusar, o erro é registrado e não sobe', () => {
    const onError = vi.fn()
    const pending = new PendingDisplayRequest(onError)
    pending.hold(() => {
      throw new Error('frame destruído')
    })

    expect(() => pending.deny()).not.toThrow()
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'frame destruído' }))
  })
})
