import { useState } from 'react'
import { uploadPicked } from '../lib/draftRequests'

/** Envia a imagem escolhida e entrega a URL; quem grava é o salvar. */
export function useProfileImageUpload(
  serverId: string,
  onDone: (url: string) => void
): { busy: boolean; pick: (file: File | undefined) => Promise<void> } {
  const [busy, setBusy] = useState(false)
  const pick = async (file: File | undefined): Promise<void> => {
    if (!file) return
    setBusy(true)
    const url = await uploadPicked(serverId, file)
    setBusy(false)
    if (url) onDone(url)
  }
  return { busy, pick }
}
