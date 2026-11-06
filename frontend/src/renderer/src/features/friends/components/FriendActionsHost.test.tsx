import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  pending: null as null | {
    kind: 'remove' | 'block'
    userId: string
    username: string
    name: string
  },
  onConfirm: null as null | (() => unknown),
  remove: vi.fn(async () => undefined),
  block: vi.fn(async () => undefined)
}))

vi.mock('./ConfirmModal', () => ({
  default: (p: {
    open: boolean
    title: string
    confirmLabel: string
    children: React.ReactNode
    onConfirm: () => unknown
  }) => {
    state.onConfirm = p.onConfirm
    return p.open ? (
      <section>
        <h2>{p.title}</h2>
        <button>{p.confirmLabel}</button>
        {p.children}
      </section>
    ) : null
  }
}))
vi.mock('../store/friendActionsStore', () => ({
  useFriendActions: (select: (s: unknown) => unknown) =>
    select({ pending: state.pending, close: () => {} })
}))
vi.mock('../store/friendStore', () => ({
  useFriendStore: { getState: () => ({ remove: state.remove, block: state.block }) }
}))
vi.mock('../../../shared/store/toastStore', () => ({ showToast: { error: vi.fn() } }))

import { renderToStaticMarkup } from 'react-dom/server'
import FriendActionsHost from './FriendActionsHost'

const ana = { userId: 'u1', username: 'ana', name: 'Ana' }

describe('FriendActionsHost', () => {
  beforeEach(() => {
    state.pending = null
    state.remove.mockClear()
    state.block.mockClear()
  })

  it('sem ação pendente, nada aberto e confirmar não faz nada', async () => {
    expect(renderToStaticMarkup(<FriendActionsHost />)).toBe('')
    await state.onConfirm?.()
    expect(state.remove).not.toHaveBeenCalled()
    expect(state.block).not.toHaveBeenCalled()
  })

  it('remover: título, botão e texto de remover; confirmar remove pelo usuário', async () => {
    state.pending = { kind: 'remove', ...ana }
    const html = renderToStaticMarkup(<FriendActionsHost />)
    expect(html).toContain('Remover &#x27;Ana&#x27;')
    expect(html).toContain('Remover amigo')
    expect(html).toContain('da sua lista de amigos?')
    await state.onConfirm?.()
    expect(state.remove).toHaveBeenCalledWith('ana')
  })

  it('bloquear: título, botão e texto de bloquear; confirmar bloqueia pelo id', async () => {
    state.pending = { kind: 'block', ...ana }
    const html = renderToStaticMarkup(<FriendActionsHost />)
    expect(html).toContain('Bloquear Ana?')
    expect(html).toContain('>Bloquear<')
    expect(html).toContain('Tem certeza que quer bloquear')
    await state.onConfirm?.()
    expect(state.block).toHaveBeenCalledWith('u1')
  })

  it('falha ao confirmar não estoura (o modal trata)', async () => {
    state.pending = { kind: 'block', ...ana }
    state.block.mockRejectedValueOnce(new Error('x'))
    renderToStaticMarkup(<FriendActionsHost />)
    await expect(state.onConfirm?.()).resolves.toBeUndefined()
  })
})
