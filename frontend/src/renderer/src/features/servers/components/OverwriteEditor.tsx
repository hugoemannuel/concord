import { useMemo, useState } from 'react'
import { useAuthStore } from '../../auth/store/authStore'
import { useServerStore } from '../store/serverStore'
import { useServerAccess } from '../hooks/useServerAccess'
import { showToast } from '../../../shared/store/toastStore'
import { actionErrorMessage } from '../lib/permissionErrors'
import { serverDisplayName } from '../lib/serverNames'
import {
  findOverwrite,
  isEmptyOverwrite,
  isPrivateChannel,
  privateOverwrite,
  targetRows,
  withTriState,
  type OverwriteTargetRef,
  type TriState
} from '../lib/channelPermissions'
import { editorSelection, memberCandidates } from '../lib/overwriteEditor'
import { Perm, everyoneRole, type ChannelKind, type ChannelOverwrite, type OverwriteTarget } from '../lib/permissions'
import { channelPermissionGroups } from '../lib/permissionCatalog'
import Modal from '../../../shared/ui/Modal'
import Switch from '../../../shared/ui/Switch'
import ChannelPermissionGroups from './ChannelPermissionGroups'
import OverwriteEditorFooter from './OverwriteEditorFooter'
import OverwriteTargetList from './OverwriteTargetList'

export interface OverwriteEditorProps {
  title: string
  kind: ChannelKind | 'category'
  /** "Canal privado" ou "Categoria privada". */
  privateLabel: string
  privateHint: string
  emptyHint: string
  errorMessage: string
  overwrites: ChannelOverwrite[] | undefined
  /** O que quem está mexendo tem aqui: só mexe no que tem. */
  myPerms: number
  put: (overwrite: ChannelOverwrite) => Promise<unknown>
  remove: (type: OverwriteTarget, targetId: string) => Promise<unknown>
  /** Busca de novo depois de gravar. */
  refresh: () => Promise<unknown>
  /** Aviso acima da opção de privado (ex.: canal vinculado à categoria). */
  notice?: React.ReactNode
  onClose: () => void
}

/**
 * Permissões de um canal ou de uma categoria: torna privado e libera ou nega
 * permissões para cargos e membros específicos (por cima do que o servidor dá).
 */
function OverwriteEditor({
  title,
  kind,
  privateLabel,
  privateHint,
  emptyHint,
  errorMessage,
  overwrites,
  myPerms,
  put,
  remove,
  refresh,
  notice,
  onClose
}: OverwriteEditorProps): React.JSX.Element {
  const roles = useServerStore((s) => s.roles)
  const members = useServerStore((s) => s.currentMembers)
  const access = useServerAccess()
  const meId = useAuthStore((s) => s.user?.id) ?? ''
  const [selected, setSelected] = useState<OverwriteTargetRef | null>(null)
  const [draft, setDraft] = useState<ChannelOverwrite | null>(null)
  const [adding, setAdding] = useState('')
  const [busy, setBusy] = useState(false)

  const everyone = everyoneRole(roles)
  const memberName = (id: string): string | undefined => {
    const m = members.find((x) => x.user_id === id)
    return m ? serverDisplayName(m, m) : undefined
  }
  const rows = useMemo(
    () => targetRows(overwrites, roles, (id) => memberName(id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [overwrites, roles, members]
  )

  const groups = channelPermissionGroups(kind)
  const isPrivate = isPrivateChannel(overwrites, everyone?.id)
  const { current, saved, working, dirty, allRows } = editorSelection({
    rows,
    overwrites,
    selected,
    draft,
    memberName
  })

  const run = async (action: () => Promise<unknown>, okMessage?: string): Promise<boolean> => {
    setBusy(true)
    try {
      await action()
      await refresh()
      if (okMessage) showToast.success(okMessage)
      return true
    } catch (err) {
      showToast.error(actionErrorMessage(err, errorMessage))
      return false
    } finally {
      setBusy(false)
    }
  }

  const togglePrivate = async (makePrivate: boolean): Promise<void> => {
    if (!everyone) return
    await run(async () => {
      await put(privateOverwrite(overwrites, everyone.id, makePrivate))
      // Quem torna privado sem ter acesso garantido por cargo não se tranca fora.
      if (makePrivate && !access.isOwner && !(access.perms & Perm.ADMINISTRATOR)) {
        await put(
          withTriState(
            findOverwrite(overwrites, { type: 'member', id: meId }),
            { type: 'member', id: meId },
            kind === 'text' ? Perm.VIEW_CHANNEL : Perm.VIEW_CHANNEL | Perm.CONNECT,
            'allow'
          )
        )
      }
    })
  }

  const setState = (bit: number, state: TriState): void => {
    if (!current) return
    setDraft(withTriState(working, current, bit, state))
  }

  const save = async (): Promise<void> => {
    if (!draft) return
    const ok = isEmptyOverwrite(draft)
      ? await run(() => remove(draft.target_type, draft.target_id), 'Permissões salvas!')
      : await run(() => put(draft), 'Permissões salvas!')
    if (ok) setDraft(null)
  }

  const removeRules = async (): Promise<void> => {
    if (!current) return
    const ok = await run(() => remove(current.type, current.id), 'Regras removidas.')
    if (ok) {
      setDraft(null)
      setSelected(null)
    }
  }

  const addTarget = (ref: OverwriteTargetRef): void => {
    setSelected(ref)
    setDraft({ target_type: ref.type, target_id: ref.id, allow: 0, deny: 0 })
    setAdding('')
  }

  const candidates = memberCandidates(members, overwrites, adding.trim().toLowerCase())

  return (
    <Modal open title={title} onClose={onClose} wide>
      {notice}
      <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-subtle bg-fg/3 px-4 py-3">
        <div>
          <p className="text-ds-sm font-semibold text-strong">{privateLabel}</p>
          <p className="text-ds-xs text-muted">{privateHint}</p>
        </div>
        <Switch checked={isPrivate} label={privateLabel} onChange={(on) => void togglePrivate(on)} />
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <OverwriteTargetList
          adding={adding}
          onAddingChange={setAdding}
          candidates={candidates}
          rows={allRows}
          current={current}
          onSelect={(ref) => {
            setSelected(ref)
            setDraft(null)
          }}
          onAdd={addTarget}
        />

        <div className="min-w-0 flex-1">
          {current ? (
            <>
              <ChannelPermissionGroups
                groups={groups}
                myChannelPerms={myPerms}
                working={working}
                busy={busy}
                onSet={setState}
              />
              <OverwriteEditorFooter
                busy={busy}
                canRemove={!!saved}
                canSave={dirty}
                onRemove={() => void removeRules()}
                onSave={() => void save()}
              />
            </>
          ) : (
            <p className="text-ds-sm text-faint">{emptyHint}</p>
          )}
        </div>
      </div>
    </Modal>
  )
}

export default OverwriteEditor
