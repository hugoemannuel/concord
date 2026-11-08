import { useState } from 'react'
import { showToast } from '../../../shared/store/toastStore'
import type { Message } from '../api/messages'
import { saveMessageEdit } from '../lib/editSave'
import { inRoom } from '../lib/chatPaneView'
import { useChatStore } from '../store/chatStore'

interface Options {
  room: string
  /** Sala atual, para uma edição que termina depois da troca de sala não fechar o editor da nova. */
  roomRef: { current: string }
  inputRef: { current: HTMLTextAreaElement | null }
}

/** Edição de mensagem no chat: qual está aberta (por sala), salvar e fechar. */
export function useMessageEditing({ room, roomRef, inputRef }: Options): {
  editingId: string | null
  savingEdit: boolean
  startEdit: (messageId: string) => void
  closeEdit: () => void
  saveEdit: (message: Message, draft: string) => Promise<void>
} {
  const editInRoom = useChatStore((s) => s.editInRoom)
  // Mensagem aberta na edição, por sala (o ServerView reaproveita o ChatPane).
  const [editState, setEditState] = useState<{ room: string; id: string } | null>(null)
  const editingId = inRoom(editState, room, 'id')
  const [savingEdit, setSavingEdit] = useState(false)

  const startEdit = (messageId: string): void => {
    setEditState({ room, id: messageId })
    requestAnimationFrame(() =>
      document.getElementById(`msg-${messageId}`)?.scrollIntoView({ block: 'nearest' })
    )
  }

  const closeEdit = (): void => {
    setEditState(null)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const saveEdit = (message: Message, draft: string): Promise<void> =>
    saveMessageEdit(message, draft, {
      room,
      currentRoom: () => roomRef.current,
      edit: editInRoom,
      close: closeEdit,
      setSaving: setSavingEdit,
      error: showToast.error
    })

  return { editingId, savingEdit, startEdit, closeEdit, saveEdit }
}
