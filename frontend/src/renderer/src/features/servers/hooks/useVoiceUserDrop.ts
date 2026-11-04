import { useState } from 'react'
import { moveToVoiceChannel, type CallParticipant } from '../../call/api/calls'
import { VOICE_USER_DRAG } from '../../call/lib/voiceMove'
import { showToast } from '../../../shared/store/toastStore'
import { actionErrorMessage } from '../lib/permissionErrors'

/** Move alguém para o canal de voz (moderadores); recusou, avisa. */
export async function moveVoiceUser(userId: string, channelId: string): Promise<void> {
  try {
    await moveToVoiceChannel(userId, channelId)
  } catch (err) {
    showToast.error(actionErrorMessage(err, 'Não foi possível mover.'))
  }
}

/**
 * O bloco do canal de voz aceita uma pessoa arrastada de outro canal de voz
 * (mover). `active` acende o canal enquanto alguém é arrastado por cima.
 */
export function useVoiceUserDrop(
  channelId: string,
  participants: CallParticipant[]
): {
  active: boolean
  clear: () => void
  handlers: {
    onDragOver: (e: React.DragEvent<HTMLElement>) => void
    onDragLeave: (e: React.DragEvent<HTMLElement>) => void
    onDrop: (e: React.DragEvent<HTMLElement>) => void
  }
} {
  const [active, setActive] = useState(false)
  const onDragOver = (e: React.DragEvent<HTMLElement>): void => {
    if (!e.dataTransfer.types.includes(VOICE_USER_DRAG)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setActive(true)
  }
  const onDragLeave = (e: React.DragEvent<HTMLElement>): void => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setActive(false)
  }
  const onDrop = (e: React.DragEvent<HTMLElement>): void => {
    const userId = e.dataTransfer.getData(VOICE_USER_DRAG)
    setActive(false)
    if (!userId || participants.some((p) => p.user_id === userId)) return
    e.preventDefault()
    void moveVoiceUser(userId, channelId)
  }
  return { active, clear: () => setActive(false), handlers: { onDragOver, onDragLeave, onDrop } }
}
