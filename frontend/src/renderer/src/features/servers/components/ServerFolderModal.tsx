import { useEffect, useState } from 'react'
import Button from '../../../shared/ui/Button'
import Input from '../../../shared/ui/Input'
import Modal from '../../../shared/ui/Modal'
import { CheckIcon } from '../../../shared/ui/icons'
import type { Server } from '../api/servers'
import { commitRailLayout } from '../hooks/useServerRailDrag'
import {
  DEFAULT_FOLDER_NAME,
  MAX_FOLDER_NAME_LENGTH,
  normalizeFolderName,
  removeServerFromLayout,
  renameFolder,
  type RailLayoutItem
} from '../lib/serverRailLayout'
import { useServerLayoutStore } from '../store/serverLayoutStore'

export function createFolderInLayout(
  items: readonly RailLayoutItem[],
  folderId: string,
  name: string,
  selectedIds: string[]
): RailLayoutItem[] {
  if (selectedIds.length === 0) return [...items]
  const anchorId = selectedIds[0]
  let cleaned = [...items]
  for (const id of selectedIds.slice(1)) {
    cleaned = removeServerFromLayout(cleaned, id)
  }
  const folder: RailLayoutItem = {
    kind: 'folder',
    id: folderId,
    name: normalizeFolderName(name),
    server_ids: selectedIds
  }
  const anchorTopIdx = cleaned.findIndex((i) => i.kind === 'server' && i.server_id === anchorId)
  if (anchorTopIdx >= 0) {
    const copy = [...cleaned]
    copy[anchorTopIdx] = folder
    return copy
  }
  return [...removeServerFromLayout(cleaned, anchorId), folder]
}

function ServerPickerList({
  servers,
  selected,
  onToggle
}: {
  servers: Server[]
  selected: string[]
  onToggle: (id: string) => void
}): React.JSX.Element {
  return (
    <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg border border-subtle bg-surface/60 p-2">
      {servers.map((srv) => {
        const isChecked = selected.includes(srv.id)
        return (
          <button
            key={srv.id}
            type="button"
            onClick={() => onToggle(srv.id)}
            className={`flex min-h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left text-ds-sm transition-colors ${
              isChecked ? 'bg-brand/15 text-strong font-medium' : 'text-normal hover:bg-fg/5'
            }`}
          >
            <span className="min-w-0 truncate">{srv.name}</span>
            {isChecked && <CheckIcon size={16} className="shrink-0 text-brand" />}
          </button>
        )
      })}
    </div>
  )
}

/** Modal para criar uma pasta de servidores ou editar o nome de uma pasta existente. */
function ServerFolderModal({
  servers,
  reconciledItems
}: {
  servers: Server[]
  reconciledItems: RailLayoutItem[]
}): React.JSX.Element | null {
  const modal = useServerLayoutStore((s) => s.folderModal)
  const close = useServerLayoutStore((s) => s.closeFolderModal)
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => {
    if (!modal) return
    setName(modal.initialName ?? '')
    setSelected(modal.initialServerIds ?? [])
  }, [modal])

  if (!modal) return null

  const isCreate = modal.mode === 'create'
  const toggleServer = (id: string): void => {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  }

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (isCreate) {
      const folderId = crypto.randomUUID()
      const next = createFolderInLayout(reconciledItems, folderId, name, selected)
      useServerLayoutStore.getState().setFolderCollapsed(folderId, false)
      void commitRailLayout(next)
    } else if (modal.folderId) {
      void commitRailLayout(renameFolder(reconciledItems, modal.folderId, name))
    }
    close()
  }

  return (
    <Modal
      open={Boolean(modal)}
      title={isCreate ? 'Criar pasta de servidores' : 'Editar pasta de servidores'}
      onClose={close}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Nome da pasta"
          placeholder={DEFAULT_FOLDER_NAME}
          maxLength={MAX_FOLDER_NAME_LENGTH}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        {isCreate && (
          <div className="flex flex-col gap-1.5">
            <span className="text-ds-sm font-medium text-normal">Servidores na pasta</span>
            <ServerPickerList servers={servers} selected={selected} onToggle={toggleServer} />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isCreate && selected.length === 0}>
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default ServerFolderModal
