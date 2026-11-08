import { useRef, useState } from 'react'
import { pastedFiles } from '../lib/longPaste'

const hasFiles = (e: React.DragEvent): boolean => e.dataTransfer.types.includes('Files')

export interface FileDropZone {
  /** Arquivo sendo arrastado por cima do chat (mostra o aviso de soltar). */
  dragging: boolean
  /** Props da área que aceita arquivos soltos. */
  zoneProps: {
    onDragEnter: (e: React.DragEvent) => void
    onDragOver: (e: React.DragEvent) => void
    onDragLeave: (e: React.DragEvent) => void
    onDrop: (e: React.DragEvent) => void
  }
  /** Colar texto continua normal; arquivo (ex.: print) ou texto longo vira anexo. */
  onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void
}

/**
 * Arrastar, soltar e colar arquivos no chat: tudo vai para addFiles.
 * draftCount: anexos no rascunho (null = sem permissão: texto longo cola normal).
 */
export function useFileDropZone(
  addFiles: (files: File[]) => void,
  draftCount: number | null = null
): FileDropZone {
  // dragenter/dragleave disparam a cada filho; o contador evita piscar.
  const dragDepth = useRef(0)
  const [dragging, setDragging] = useState(false)

  const zoneProps: FileDropZone['zoneProps'] = {
    onDragEnter: (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current += 1
      setDragging(true)
    },
    onDragOver: (e) => {
      if (hasFiles(e)) e.preventDefault()
    },
    onDragLeave: (e) => {
      if (!hasFiles(e)) return
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    },
    onDrop: (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      addFiles(Array.from(e.dataTransfer.files))
    }
  }

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>): void => {
    const files = pastedFiles(e.clipboardData, draftCount)
    if (files.length === 0) return
    e.preventDefault()
    addFiles(files)
  }

  return { dragging, zoneProps, onPaste }
}
