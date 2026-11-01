import { beforeEach, describe, expect, it, vi } from 'vitest'

// Sem DOM no vitest: localStorage, matchMedia e o <html> são de mentira.

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    clear: () => data.clear(),
    key: (i) => [...data.keys()][i] ?? null,
    get length() {
      return data.size
    }
  }
}

let systemDark = true
let mediaListener: (() => void) | null = null
let storageListener: ((e: { key: string; newValue: string | null }) => void) | null = null
const titleBar = vi.fn()
const meta = { setAttribute: vi.fn() }
const root = { dataset: {} as Record<string, string> }

/** Cores que o CSS daria a cada tema (só as que o store lê). */
const COLORS: Record<string, Record<string, string>> = {
  'discord-dark': { '--bg-app': '#121214', '--interactive-normal': '#96979e' },
  'discord-light': { '--bg-app': '#f3f3f4', '--interactive-normal': '#595a63' },
  midnight: { '--bg-app': '#0b1220', '--interactive-normal': '#b6c2d3' },
  'custom-red1': { '--bg-app': '#190606', '--interactive-normal': '#d9bcbc' }
}

const RED = {
  id: 'red1',
  name: 'Vermelho',
  accent: '#e11d48',
  background: '#2a0a0a',
  sidebar: '#1f0707',
  card: '#3b0d0d',
  text: '#ffffff',
  glow: ''
}
const LIGHT = { ...RED, id: 'luz1', background: '#ffffff', sidebar: '#fff1f2', card: '#ffffff', text: '#1f1f1f' }

beforeEach(() => {
  vi.resetModules()
  systemDark = true
  mediaListener = null
  storageListener = null
  titleBar.mockClear()
  meta.setAttribute.mockClear()
  root.dataset = {}
  globalThis.localStorage = memoryStorage()
  vi.stubGlobal('document', {
    documentElement: root,
    querySelector: (sel: string) => (sel === 'meta[name="theme-color"]' ? meta : null)
  })
  vi.stubGlobal('getComputedStyle', () => ({
    getPropertyValue: (name: string) => ` ${COLORS[root.dataset.theme]?.[name] ?? ''}`
  }))
  vi.stubGlobal('window', {
    matchMedia: () => ({
      get matches() {
        return systemDark
      },
      addEventListener: (_: string, cb: () => void) => (mediaListener = cb)
    }),
    addEventListener: (type: string, cb: typeof storageListener) => {
      if (type === 'storage') storageListener = cb
    },
    api: { windowTheme: { setTitleBarColors: titleBar } }
  })
})

async function load(): Promise<typeof import('./themeStore')> {
  return import('./themeStore')
}

describe('themeStore', () => {
  it('sem nada salvo começa no Discord Escuro e pinta o documento', async () => {
    const { startThemeSync, useThemeStore } = await load()
    startThemeSync()
    expect(useThemeStore.getState()).toMatchObject({
      preference: 'discord-dark',
      theme: 'discord-dark'
    })
    expect(root.dataset.theme).toBe('discord-dark')
    expect(meta.setAttribute).toHaveBeenCalledWith('content', '#121214')
    expect(titleBar).toHaveBeenCalledWith({ color: '#121214', symbolColor: '#96979e' })
  })

  it('aplica o tema salvo já no início', async () => {
    localStorage.setItem('concord:theme', 'midnight')
    const { startThemeSync } = await load()
    startThemeSync()
    expect(root.dataset.theme).toBe('midnight')
  })

  it('trocar aplica na hora e salva', async () => {
    const { startThemeSync, useThemeStore } = await load()
    startThemeSync()
    useThemeStore.getState().setPreference('discord-light')
    expect(root.dataset.theme).toBe('discord-light')
    expect(localStorage.getItem('concord:theme')).toBe('discord-light')
    expect(titleBar).toHaveBeenLastCalledWith({ color: '#f3f3f4', symbolColor: '#595a63' })
  })

  it('"Seguir o sistema" acompanha a troca de claro/escuro do sistema', async () => {
    const { startThemeSync, useThemeStore } = await load()
    startThemeSync()
    useThemeStore.getState().setPreference('system')
    expect(useThemeStore.getState().theme).toBe('discord-dark')
    systemDark = false
    mediaListener?.()
    expect(useThemeStore.getState().theme).toBe('discord-light')
    expect(root.dataset.theme).toBe('discord-light')
  })

  it('com tema fixo, mudar o sistema não mexe', async () => {
    const { startThemeSync, useThemeStore } = await load()
    startThemeSync()
    useThemeStore.getState().setPreference('midnight')
    systemDark = false
    mediaListener?.()
    expect(root.dataset.theme).toBe('midnight')
  })

  it('outra janela (overlay ↔ app) trocou: acompanha', async () => {
    const { startThemeSync, useThemeStore } = await load()
    startThemeSync({ titleBar: false })
    storageListener?.({ key: 'concord:theme', newValue: 'midnight' })
    expect(useThemeStore.getState().preference).toBe('midnight')
    expect(root.dataset.theme).toBe('midnight')
    // O overlay não tem barra de título.
    expect(titleBar).not.toHaveBeenCalled()
    storageListener?.({ key: 'outra-coisa', newValue: 'forest' })
    expect(root.dataset.theme).toBe('midnight')
  })

  it('tema próprio salvo vale no início e marca claro/escuro (data-scheme)', async () => {
    localStorage.setItem('concord:custom-themes', JSON.stringify([RED, LIGHT]))
    localStorage.setItem('concord:theme', 'custom-red1')
    const { startThemeSync, useThemeStore } = await load()
    startThemeSync()
    expect(root.dataset.theme).toBe('custom-red1')
    expect(root.dataset.scheme).toBe('dark')
    expect(titleBar).toHaveBeenCalledWith({ color: '#190606', symbolColor: '#d9bcbc' })
    useThemeStore.getState().setPreference('custom-luz1')
    expect(root.dataset.scheme).toBe('light')
    useThemeStore.getState().setPreference('discord-light')
    expect(root.dataset.scheme).toBe('light')
  })

  it('tema próprio que não existe aqui cai no padrão, mas a escolha fica', async () => {
    localStorage.setItem('concord:theme', 'custom-sumiu')
    const { startThemeSync, useThemeStore } = await load()
    startThemeSync()
    expect(useThemeStore.getState()).toMatchObject({ preference: 'custom-sumiu', theme: 'discord-dark' })
    expect(root.dataset.theme).toBe('discord-dark')
  })

  it('refreshTheme repinta a barra mesmo sem trocar de tema (tema próprio editado)', async () => {
    localStorage.setItem('concord:custom-themes', JSON.stringify([RED]))
    localStorage.setItem('concord:theme', 'custom-red1')
    const { startThemeSync, refreshTheme } = await load()
    startThemeSync()
    titleBar.mockClear()
    refreshTheme()
    expect(titleBar).toHaveBeenCalledTimes(1)
  })

  it('prévia do editor: o documento mostra o rascunho até ela acabar, mesmo se a escolha mudar', async () => {
    const { startThemeSync, setThemePreview, useThemeStore } = await load()
    startThemeSync()
    useThemeStore.getState().setPreference('midnight')
    setThemePreview({ key: 'custom-draft', scheme: 'light' })
    expect(root.dataset.theme).toBe('custom-draft')
    expect(root.dataset.scheme).toBe('light')
    storageListener?.({ key: 'concord:theme', newValue: 'forest' })
    expect(useThemeStore.getState().preference).toBe('forest')
    expect(root.dataset.theme).toBe('custom-draft')
    setThemePreview(null)
    expect(root.dataset.theme).toBe('forest')
    expect(root.dataset.scheme).toBe('dark')
  })
})
