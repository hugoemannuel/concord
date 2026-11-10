import { useState } from 'react'
import { updateChannel, type ChannelType } from '../api/channels'
import type { Server } from '../api/servers'
import type { Role } from '../lib/permissions'
import { useServerStore } from '../store/serverStore'
import { useChannelSidebarStore, type ChannelForm } from '../store/channelSidebarStore'
import { useChatStore } from '../../chat/store/chatStore'
import { showToast } from '../../../shared/store/toastStore'
import Modal from '../../../shared/ui/Modal'
import Button from '../../../shared/ui/Button'
import Input from '../../../shared/ui/Input'
import Switch from '../../../shared/ui/Switch'
import ChannelCategoryPicker from './ChannelCategoryPicker'
import ChannelSlowmodeField from './ChannelSlowmodeField'
import { VolumeIcon } from '../../../shared/ui/icons'
import { actionErrorMessage } from '../lib/permissionErrors'
import { channelSlug } from '../lib/channelSidebar'
import { canSubmitChannel, saveChannel, toggleRole, type ChannelFormApi } from '../lib/channelForm'

const TYPE_BUTTON =
  'flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-ds-md font-medium transition-colors'

/** Texto ou voz (só ao criar). */
function ChannelTypePicker({
  type,
  onChange
}: {
  type: ChannelType
  onChange: (type: ChannelType) => void
}): React.JSX.Element {
  return (
    <div>
      <p className="mb-1 block text-ds-sm font-medium text-muted">Tipo do canal</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange('text')}
          className={`${TYPE_BUTTON} ${
            type === 'text'
              ? 'border-brand bg-brand/20 text-strong'
              : 'border-subtle text-muted hover:bg-fg/5'
          }`}
        >
          <span className="text-ds-md leading-none">#</span>
          Texto
        </button>
        <button
          type="button"
          onClick={() => onChange('voice')}
          className={`${TYPE_BUTTON} ${
            type === 'voice'
              ? 'border-success bg-success/15 text-strong'
              : 'border-subtle text-muted hover:bg-fg/5'
          }`}
        >
          <VolumeIcon className="h-4 w-4" />
          Voz
        </button>
      </div>
    </div>
  )
}

/** Quem pode ver o canal privado: os cargos marcados (e quem criou). */
export function PrivateRolesPicker({
  roles,
  roleIds,
  onChange
}: {
  roles: Role[]
  roleIds: string[]
  onChange: (roleIds: string[]) => void
}): React.JSX.Element {
  const choosable = roles.filter((r) => !r.is_default)
  return (
    <div className="mt-3 border-t border-subtle pt-3">
      <p className="mb-2 text-ds-sm font-medium text-muted">Quem pode ver</p>
      {choosable.length === 0 ? (
        <p className="text-ds-sm text-faint">
          Nenhum cargo ainda: só você e o dono vão ver. Crie cargos em Configurações do servidor.
        </p>
      ) : (
        <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
          {choosable.map((r) => (
            <li key={r.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-ds-md text-normal hover:bg-fg/5">
                <input
                  type="checkbox"
                  checked={roleIds.includes(r.id)}
                  onChange={(e) => onChange(toggleRole(roleIds, r.id, e.target.checked))}
                />
                <span className="truncate">{r.name}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Canal novo privado: só os cargos escolhidos (e quem criou) veem. */
function PrivateChannelFields({
  type,
  isPrivate,
  onPrivate,
  roleIds,
  onRoles
}: {
  type: ChannelType
  isPrivate: boolean
  onPrivate: (value: boolean) => void
  roleIds: string[]
  onRoles: (roleIds: string[]) => void
}): React.JSX.Element {
  const roles = useServerStore((s) => s.roles)
  return (
    <div className="rounded-lg border border-subtle bg-fg/3 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-ds-md font-medium text-strong">Canal privado</p>
          <p className="text-ds-sm text-muted">
            {type === 'voice'
              ? 'Só os cargos escolhidos (e você) veem e entram neste canal.'
              : 'Só os cargos escolhidos (e você) veem este canal.'}
          </p>
        </div>
        <Switch checked={isPrivate} label="Canal privado" onChange={onPrivate} />
      </div>
      {isPrivate && <PrivateRolesPicker roles={roles} roleIds={roleIds} onChange={onRoles} />}
    </div>
  )
}

const formApi: ChannelFormApi = {
  create: (serverId, name, type, opts) =>
    useServerStore.getState().createChannel(serverId, name, type, opts),
  update: async (serverId, channelId, input) => {
    await updateChannel(serverId, channelId, input)
    await useServerStore.getState().fetchChannels(serverId)
  },
  refresh: (serverId) => void useChatStore.getState().fetchChannelsForServers([serverId])
}

/** Criar (texto ou voz, público ou privado) ou editar (nome e modo lento) um canal. */
function ChannelFormDialog({
  server,
  form
}: {
  server: Server
  form: ChannelForm
}): React.JSX.Element {
  const closeForm = useChannelSidebarStore((s) => s.closeForm)
  const [name, setName] = useState(form.editing?.name ?? '')
  const [type, setType] = useState<ChannelType>(form.type)
  const [isPrivate, setPrivate] = useState(false)
  const [roleIds, setRoleIds] = useState<string[]>([])
  const [categoryId, setCategoryId] = useState(form.categoryId ?? '')
  const [slowmodeSeconds, setSlowmodeSeconds] = useState(form.editing?.slowmode_seconds ?? 0)
  const [saving, setSaving] = useState(false)
  const editing = form.editing

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    const slug = channelSlug(name)
    if (!canSubmitChannel(slug, saving, server.id)) return
    setSaving(true)
    try {
      const input = { serverId: server.id, name: slug, editing, type, private: isPrivate, roleIds, categoryId, slowmodeSeconds }
      const done = await saveChannel(input, formApi)
      closeForm()
      showToast.success(done)
    } catch (err) {
      showToast.error(actionErrorMessage(err, 'Falha ao salvar canal.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      title={`${editing ? 'Editar' : 'Criar'} canal em ${server.name}`}
      onClose={closeForm}
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1 block text-ds-sm font-medium text-muted" htmlFor="channel-name">
            Nome do canal
          </label>
          <Input
            id="channel-name"
            placeholder="ex.: off-topic"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={32}
          />
        </div>
        {editing && <ChannelSlowmodeField value={slowmodeSeconds} onChange={setSlowmodeSeconds} />}
        {!editing && <ChannelTypePicker type={type} onChange={setType} />}
        {!editing && <ChannelCategoryPicker serverId={server.id} value={categoryId} onChange={setCategoryId} />}
        {!editing && (
          <PrivateChannelFields
            type={type}
            isPrivate={isPrivate}
            onPrivate={setPrivate}
            roleIds={roleIds}
            onRoles={setRoleIds}
          />
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={closeForm}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={saving || !name.trim()}>
            {submitLabel(saving, Boolean(editing))}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function submitLabel(saving: boolean, editing: boolean): string {
  if (saving) return 'Salvando…'
  return editing ? 'Salvar' : 'Criar canal'
}

/** O formulário de canal, quando aberto (cada abertura nasce limpa). */
function ChannelFormModal({ server }: { server: Server }): React.JSX.Element | null {
  const form = useChannelSidebarStore((s) => s.form)
  if (!form) return null
  return <ChannelFormDialog key={form.session} server={server} form={form} />
}

export default ChannelFormModal
