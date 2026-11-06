import { useEffect } from 'react'
import { useCallStore } from '../store/callStore'
import { useSoundboardStore } from '../store/soundboardStore'
import { useSoundFavoritesStore } from '../store/soundFavoritesStore'
import { allServerSounds, findSoundForShortcut } from '../lib/soundboardSections'

const MODIFIER_ONLY_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta'])

export function formatKeyboardShortcut(e: KeyboardEvent): string | null {
  if (MODIFIER_ONLY_KEYS.has(e.key)) return null
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')

  let main = e.key
  if (main === ' ') main = 'Space'
  else if (main.length === 1) main = main.toUpperCase()

  // Para evitar disparo acidental digitando no app, teclas simples de 1 letra/número
  // sem modificador exigem pelo menos Alt/Ctrl (teclas F1–F12 funcionam sozinhas).
  const isFunctionKey = /^F([1-9]|1[0-2])$/i.test(main)
  if (parts.length === 0 && !isFunctionKey) {
    return null
  }
  parts.push(main)
  return parts.join('+')
}

export function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable
}

/** Chamada ativa num canal de servidor (a única com mesa de áudio). */
export function channelCallServer(
  status: string,
  type: string | null,
  serverId: string | null
): string | null {
  return status === 'active' && type === 'channel' ? serverId : null
}

/**
 * O som do atalho apertado: entre os dos servidores da pessoa (o da chamada
 * primeiro) e os favoritos. Nada se a tecla repete ou cai num campo.
 */
export function soundForKeyEvent(e: KeyboardEvent, serverId: string): { id: string } | undefined {
  if (e.repeat || isEditableElement(e.target)) return undefined
  const shortcut = formatKeyboardShortcut(e)
  if (!shortcut) return undefined
  const { keybinds, soundsByServer } = useSoundboardStore.getState()
  const sounds = [...allServerSounds(soundsByServer, serverId), ...useSoundFavoritesStore.getState().favorites]
  return findSoundForShortcut(shortcut, keybinds, sounds)
}

export function useSoundboardHotkeys(): void {
  const serverId = useCallStore((s) => channelCallServer(s.status, s.type, s.serverId))
  const loadServerSounds = useSoundboardStore((s) => s.loadServerSounds)
  const loadFavorites = useSoundFavoritesStore((s) => s.load)

  useEffect(() => {
    if (!serverId) return
    void loadServerSounds(serverId)
    void loadFavorites()
  }, [serverId, loadServerSounds, loadFavorites])

  useEffect(() => {
    if (!serverId) return

    const onKeyDown = (e: KeyboardEvent): void => {
      const match = soundForKeyEvent(e, serverId)
      if (!match) return
      e.preventDefault()
      useSoundboardStore.getState().triggerSound(match.id)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [serverId])
}
