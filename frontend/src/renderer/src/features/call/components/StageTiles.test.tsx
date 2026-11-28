import { afterEach, describe, expect, it, vi } from 'vitest'

const captured = vi.hoisted(() => ({
  onContextMenu: undefined as ((e: unknown) => void) | undefined
}))

vi.mock('./ParticipantTile', () => ({
  default: (props: { onContextMenu?: (e: unknown) => void }) => {
    captured.onContextMenu = props.onContextMenu
    return <div data-participant="" />
  }
}))

vi.mock('../../auth/store/authStore', () => ({
  useAuthStore: (sel: (s: { user?: { id: string } }) => unknown) => sel({ user: { id: 'eu' } })
}))

vi.mock('../store/callStore', () => ({
  useCallStore: (sel: (s: { muted: boolean; deafened: boolean }) => unknown) =>
    sel({ muted: false, deafened: false })
}))

import { renderToStaticMarkup } from 'react-dom/server'
import * as userMenuStore from '../../profile/store/userMenuStore'
import { MeTile } from './StageTiles'

describe('StageTiles: menu próprio no palco', () => {
  afterEach(() => {
    captured.onContextMenu = undefined
    vi.restoreAllMocks()
  })

  it('MeTile passa onContextMenu com allowSelf para o próprio usuário se liberar na chamada', () => {
    const spy = vi.spyOn(userMenuStore, 'userMenuHandler')
    renderToStaticMarkup(
      <MeTile info={{ id: 'eu', username: 'eu', display_name: 'Eu' }} size="md" />
    )
    expect(spy).toHaveBeenCalledWith('eu', 'Eu', 'eu', 'eu', { allowSelf: true })
    expect(typeof captured.onContextMenu).toBe('function')
  })
})
