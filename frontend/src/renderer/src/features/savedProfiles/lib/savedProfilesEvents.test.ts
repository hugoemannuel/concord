import { describe, expect, it, vi } from 'vitest'
import { handleSavedProfilesEvent } from './savedProfilesEvents'

describe('handleSavedProfilesEvent', () => {
  it('saved_profiles:changed recarrega a lista', () => {
    const refresh = vi.fn()
    handleSavedProfilesEvent(
      { type: 'saved_profiles:changed', payload: { user_id: 'eu' } },
      { refresh }
    )
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('ignora outros eventos', () => {
    const refresh = vi.fn()
    handleSavedProfilesEvent({ type: 'user:update', payload: {} }, { refresh })
    expect(refresh).not.toHaveBeenCalled()
  })
})
