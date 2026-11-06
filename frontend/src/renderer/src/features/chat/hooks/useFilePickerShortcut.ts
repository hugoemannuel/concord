import { useEffect, useRef } from 'react'
import { useUIStore } from '../../../shared/store/uiStore'

/** Ctrl+Shift+U (atalho global) abre o seletor de arquivos deste chat. */
export function useFilePickerShortcut(
  fileInputRef: React.RefObject<HTMLInputElement | null>,
  canAttach: boolean
): void {
  const filePickerRequest = useUIStore((s) => s.filePickerRequest)
  const seenFilePickerRequest = useRef(filePickerRequest)
  useEffect(() => {
    if (filePickerRequest === seenFilePickerRequest.current) return
    seenFilePickerRequest.current = filePickerRequest
    if (canAttach) fileInputRef.current?.click()
  }, [filePickerRequest, canAttach, fileInputRef])
}
