import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  listener: null as ((e: { type: string; payload: unknown }) => void) | null,
  load: vi.fn()
}))
vi.mock('../../../shared/api/ws', () => ({
  onWsEvent: (fn: (e: { type: string; payload: unknown }) => void) => {
    h.listener = fn
    return () => {}
  }
}))
vi.mock('../api/plugins', () => ({}))

import { usePluginsStore } from '../store/pluginsStore'
import { startPluginsEvents } from './pluginsEventsStart'

describe('startPluginsEvents', () => {
  beforeEach(() => {
    h.load.mockReset()
    usePluginsStore.setState({ byServer: { s1: [] }, catalog: null, load: h.load })
  })

  it('servidor carregado: recarrega uma vez', () => {
    startPluginsEvents()
    h.listener?.({ type: 'plugins:changed', payload: { server_id: 's1' } })
    expect(h.load).toHaveBeenCalledTimes(1)
    expect(h.load).toHaveBeenCalledWith('s1')
  })

  it('servidor não carregado ou outro evento: ignora', () => {
    startPluginsEvents()
    h.listener?.({ type: 'plugins:changed', payload: { server_id: 's2' } })
    h.listener?.({ type: 'message:create', payload: { server_id: 's1' } })
    expect(h.load).not.toHaveBeenCalled()
  })
})
