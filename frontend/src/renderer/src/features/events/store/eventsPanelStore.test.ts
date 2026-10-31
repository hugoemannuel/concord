import { beforeEach, describe, expect, it } from 'vitest'
import { useEventsPanelStore } from './eventsPanelStore'

describe('painel de eventos', () => {
  beforeEach(() => useEventsPanelStore.setState({ serverId: null }))

  it('começa fechado', () => {
    expect(useEventsPanelStore.getState().serverId).toBeNull()
  })

  it('abre para um servidor e fecha', () => {
    useEventsPanelStore.getState().open('s1')
    expect(useEventsPanelStore.getState().serverId).toBe('s1')
    useEventsPanelStore.getState().close()
    expect(useEventsPanelStore.getState().serverId).toBeNull()
  })

  it('abrir de novo troca o servidor', () => {
    useEventsPanelStore.getState().open('s1')
    useEventsPanelStore.getState().open('s2')
    expect(useEventsPanelStore.getState().serverId).toBe('s2')
  })
})
