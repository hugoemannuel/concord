import { useEffect, useState } from 'react'
import { showToast } from '../../../shared/store/toastStore'
import { useSoundboardStore } from '../store/soundboardStore'
import { formatKeyboardShortcut } from './useSoundboardHotkeys'

/** O que fazer com a tecla apertada enquanto se grava o atalho de um som. */
export type KeybindAction = { kind: 'cancel' } | { kind: 'clear' } | { kind: 'set'; shortcut: string } | { kind: 'invalid' }

export function keybindAction(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): KeybindAction {
  if (e.key === 'Escape') return { kind: 'cancel' }
  if (e.key === 'Backspace' || e.key === 'Delete') return { kind: 'clear' }
  const shortcut = formatKeyboardShortcut(e as KeyboardEvent)
  return shortcut ? { kind: 'set', shortcut } : { kind: 'invalid' }
}

/**
 * A tecla apertada durante a gravação: não chega ao resto do app; vira o
 * atalho (ou limpa, ou cancela) e encerra a gravação. Tecla sem atalho só avisa.
 */
export function keybindKeyHandler(
  soundId: string,
  setKeybind: (soundId: string, keybind: string | null) => void,
  stop: () => void
): (e: KeyboardEvent) => void {
  return (e) => {
    e.preventDefault()
    e.stopPropagation()
    const action = keybindAction(e)
    if (action.kind === 'invalid') {
      showToast.info('Use F1–F12 ou uma combinação com Alt / Ctrl (ex.: Alt+1).')
      return
    }
    if (action.kind !== 'cancel') setKeybind(soundId, action.kind === 'set' ? action.shortcut : null)
    stop()
  }
}

/**
 * Gravação do atalho de teclado de um som da mesa: a próxima tecla vira o
 * atalho (Esc cancela, Backspace/Delete limpa).
 */
export function useKeybindRecording(): {
  recordingSoundId: string | null
  toggleRecording: (soundId: string) => void
} {
  const setKeybind = useSoundboardStore((s) => s.setKeybind)
  const [recordingSoundId, setRecordingSoundId] = useState<string | null>(null)

  useEffect(() => {
    if (!recordingSoundId) return
    const onKey = keybindKeyHandler(recordingSoundId, setKeybind, () => setRecordingSoundId(null))
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recordingSoundId, setKeybind])

  return {
    recordingSoundId,
    toggleRecording: (soundId) => setRecordingSoundId((cur) => (cur === soundId ? null : soundId))
  }
}
