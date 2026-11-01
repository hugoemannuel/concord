import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Sem DOM no vitest: o <head>, o <html> e a prévia do themeStore são de mentira.
const preview = vi.hoisted(() => vi.fn())
vi.mock('../../settings/store/themeStore', () => ({ setThemePreview: preview }))

import { DRAFT_KEY, showDraft, stopDraft } from './livePreview'
import { PRESET_SEEDS } from './presetSeeds'

const styles = new Map<string, { id: string; textContent: string }>()
const root = { dataset: {} as Record<string, string> }

beforeEach(() => {
  styles.clear()
  root.dataset = {}
  preview.mockClear()
  vi.stubGlobal('document', {
    documentElement: root,
    getElementById: (id: string) => styles.get(id) ?? null,
    createElement: () => ({ id: '', textContent: '' }),
    head: { appendChild: (el: { id: string; textContent: string }) => styles.set(el.id, el) }
  })
})

afterEach(() => {
  stopDraft()
  vi.unstubAllGlobals()
})

const nextFrame = (): Promise<void> => new Promise((r) => setTimeout(r, 40))
const draftCss = (): string => [...styles.values()].map((s) => s.textContent).join('')

describe('livePreview', () => {
  it('junta as mudanças do mesmo quadro numa escrita só e mostra o rascunho no app', async () => {
    showDraft(PRESET_SEEDS.midnight)
    showDraft(PRESET_SEEDS['discord-light'])
    expect(preview).not.toHaveBeenCalled()
    await nextFrame()
    expect(preview).toHaveBeenCalledTimes(1)
    expect(preview).toHaveBeenCalledWith({ key: DRAFT_KEY, scheme: 'light' })
    expect(draftCss()).toContain(`[data-theme='${DRAFT_KEY}'] { color-scheme: light;`)
    expect(root.dataset.themeLive).toBe('')
  })

  it('parar volta ao tema escolhido e limpa o rascunho', async () => {
    showDraft(PRESET_SEEDS.midnight)
    await nextFrame()
    stopDraft()
    expect(preview).toHaveBeenLastCalledWith(null)
    expect(draftCss()).toBe('')
    expect(root.dataset.themeLive).toBeUndefined()
  })

  it('parar antes do quadro não chega a escrever', async () => {
    showDraft(PRESET_SEEDS.midnight)
    stopDraft()
    await nextFrame()
    expect(preview).toHaveBeenCalledTimes(1)
    expect(preview).toHaveBeenCalledWith(null)
  })
})
