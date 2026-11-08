import { useEffect, useRef } from 'react'
import { composerFocusPlan, hasFinePointer, isTextField } from '../lib/composerFocus'

/**
 * Ao abrir (ou trocar de) canal ou DM, o campo de mensagem recebe o foco,
 * para já sair digitando. Não foca em tela de toque, sem permissão de enviar
 * nem quando outro campo de texto está com o foco.
 */
export function useAutoFocusComposer({
  room,
  inputRef,
  canSend
}: {
  room: string
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  canSend: boolean
}): void {
  const focusedRoom = useRef<string | null>(null)

  useEffect(() => {
    const active = document.activeElement
    const plan = composerFocusPlan({
      room,
      focusedRoom: focusedRoom.current,
      canSend,
      finePointer: hasFinePointer(window),
      typingElsewhere: active !== inputRef.current && isTextField(active as HTMLElement | null)
    })
    focusedRoom.current = plan.focusedRoom
    if (plan.focus) inputRef.current?.focus({ preventScroll: true })
  }, [room, canSend, inputRef])
}
