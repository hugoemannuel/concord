import { beforeEach, describe, expect, it, vi } from 'vitest'

const sheet = vi.hoisted(() => ({ writeStyleSheet: vi.fn(), SAVED_THEMES_STYLE: 'saved' }))
const theme = vi.hoisted(() => ({ refreshTheme: vi.fn() }))
const api = vi.hoisted(() => ({ getAppThemes: vi.fn(), saveAppThemes: vi.fn() }))
vi.mock('./themeStyleSheet', () => sheet)
vi.mock('../../settings/store/themeStore', () => theme)
vi.mock('../api/appThemes', () => api)

import { useAuthStore } from '../../auth/store/authStore'
import { useCustomThemesStore } from '../store/customThemesStore'
import { syncThemesWithAccount, startCustomThemes } from './customThemesStart'
import type { CustomTheme } from './customThemes'

const RED: CustomTheme = {
  id: 'red1',
  name: 'Vermelho',
  accent: '#e11d48',
  background: '#2a0a0a',
  sidebar: '#1f0707',
  card: '#3b0d0d',
  text: '#ffffff',
  glow: ''
}

beforeEach(() => {
  vi.clearAllMocks()
  useCustomThemesStore.setState({ themes: [] })
  api.getAppThemes.mockResolvedValue({ themes: [] })
})

describe('startCustomThemes', () => {
  it('escreve o CSS já no início e reescreve + reaplica o tema quando a lista muda', () => {
    const stop = startCustomThemes({ account: false })
    expect(sheet.writeStyleSheet).toHaveBeenCalledWith('saved', '')
    useCustomThemesStore.setState({ themes: [RED] })
    expect(sheet.writeStyleSheet).toHaveBeenLastCalledWith('saved', expect.stringContaining("[data-theme='custom-red1']"))
    expect(theme.refreshTheme).toHaveBeenCalledTimes(1)
    useCustomThemesStore.setState({ saving: true })
    expect(theme.refreshTheme).toHaveBeenCalledTimes(1)
    stop()
  })
})

describe('syncThemesWithAccount', () => {
  it('carrega da conta ao entrar ou trocar de conta, e só aí', () => {
    syncThemesWithAccount('u1', undefined)
    syncThemesWithAccount('u1', 'u1')
    syncThemesWithAccount(undefined, 'u1')
    expect(api.getAppThemes).toHaveBeenCalledTimes(1)
  })
})

describe('integração com o login', () => {
  it('liga ao authStore', () => {
    const stop = startCustomThemes()
    useAuthStore.setState({ user: { id: 'u9' } as never })
    expect(api.getAppThemes).toHaveBeenCalled()
    stop()
  })
})
