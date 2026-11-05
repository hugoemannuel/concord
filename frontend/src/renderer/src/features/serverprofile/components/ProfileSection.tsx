import { useState } from 'react'
import { showToast } from '../../../shared/store/toastStore'
import Input from '../../../shared/ui/Input'
import Switch from '../../../shared/ui/Switch'
import type { MediaChange } from '../../profile/lib/profileValidation'
import type { Server } from '../../servers/api/servers'
import ServerIconPicker from '../../servers/components/ServerIconPicker'
import { useServerStore } from '../../servers/store/serverStore'
import { useProfileDraft } from '../hooks/useProfileDraft'
import { MAX_DESCRIPTION, type ProfileDraft } from '../lib/profileDraft'
import { basicsDirty, saveProfileForm, shownIcon, type BasicsActions } from '../lib/profileSave'
import ArtPicker from './ArtPicker'
import GamesField from './GamesField'
import ProfileEditorLayout, { EditorField, EditorLoading, UnsavedBar } from './ProfileEditorLayout'
import ServerCardView, { LockedServerCard } from './ServerCardView'
import TraitsField from './TraitsField'

/** Perfil privado: o interruptor e como quem está fora vê o servidor. */
function PrivateField({
  checked,
  onChange
}: {
  checked: boolean
  onChange: (checked: boolean) => void
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-4 md:flex-row md:items-start">
      <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-ds-md font-semibold text-strong">Perfil privado</h3>
          <p className="mt-0.5 text-ds-sm text-muted">
            Ligado, só os membros e quem tem um convite veem o perfil. Para os outros, inclusive quem clica
            na tag, aparece apenas “Servidor privado”.
          </p>
        </div>
        <Switch checked={checked} onChange={onChange} label="Perfil privado" />
      </div>
      {checked && (
        <div className="w-full md:w-60 md:shrink-0">
          <LockedServerCard />
        </div>
      )}
    </section>
  )
}

/** Nome e ícone (domínio server), o resto do perfil (serverprofile) e o salvar único. */
export default function ProfileSection(): React.JSX.Element {
  const server = useServerStore((s) => s.currentServer)
  return server ? <ProfileForm key={server.id} serverId={server.id} /> : <EditorLoading />
}

function ProfileForm({ serverId }: { serverId: string }): React.JSX.Element {
  const server = useServerStore((s) => s.currentServer)
  const updateServer = useServerStore((s) => s.updateServer)
  const setServerIcon = useServerStore((s) => s.setServerIcon)
  const form = useProfileDraft(serverId)
  const [name, setName] = useState(server?.name ?? '')
  const [icon, setIcon] = useState<MediaChange>({ kind: 'keep' })
  const [savingBasics, setSavingBasics] = useState(false)

  const { draft, preview } = form
  if (!server || !draft || !preview) return <EditorLoading />

  const save = async (): Promise<void> => {
    setSavingBasics(true)
    const ok = await saveProfileForm({
      server,
      name,
      icon,
      actions: { updateServer, setServerIcon: setServerIcon as BasicsActions['setServerIcon'] },
      onBasicsSaved: () => setIcon({ kind: 'keep' }),
      draftDirty: form.dirty,
      saveDraft: form.save
    })
    setSavingBasics(false)
    if (ok) showToast.success('Servidor atualizado!')
  }

  const reset = (): void => {
    setName(server.name)
    setIcon({ kind: 'keep' })
    form.reset()
  }

  return (
    <ProfileEditorLayout
      previewLabel="Como aparece para os outros"
      preview={
        <ServerCardView card={{ ...preview, name: name.trim() || server.name, icon_url: shownIcon(icon, server.icon_url) }} />
      }
      bar={
        (form.dirty || basicsDirty(server, name, icon)) && (
          <UnsavedBar
            saving={form.saving || savingBasics}
            canSave={name.trim() !== ''}
            onReset={reset}
            onSave={() => void save()}
          />
        )
      }
    >
      <BasicsFields server={server} name={name} icon={icon} onName={setName} onIcon={setIcon} />
      <ProfileFields serverId={serverId} draft={draft} onChange={form.change} />
    </ProfileEditorLayout>
  )
}

function BasicsFields({
  server,
  name,
  icon,
  onName,
  onIcon
}: {
  server: Server
  name: string
  icon: MediaChange
  onName: (name: string) => void
  onIcon: (icon: MediaChange) => void
}): React.JSX.Element {
  return (
    <>
      <EditorField title="Nome">
        <Input
          aria-label="Nome do servidor"
          placeholder="ex.: Meu Servidor"
          value={name}
          maxLength={32}
          onChange={(e) => onName(e.target.value)}
        />
      </EditorField>
      <EditorField>
        <ServerIconPicker name={name || server.name} currentUrl={server.icon_url} value={icon} onChange={onIcon} />
      </EditorField>
    </>
  )
}

function ProfileFields({
  serverId,
  draft,
  onChange
}: {
  serverId: string
  draft: ProfileDraft
  onChange: (patch: Partial<ProfileDraft>) => void
}): React.JSX.Element {
  return (
    <>
      <EditorField title="Banner" hint="Aparece no topo do cartão do servidor.">
        <ArtPicker serverId={serverId} label="Banner" value={draft.banner} onChange={(banner) => onChange({ banner })} />
      </EditorField>
      <EditorField title="Traços" hint="Até 5, para mostrar os interesses e o jeito do servidor.">
        <TraitsField traits={draft.traits} onChange={(traits) => onChange({ traits })} />
      </EditorField>
      <EditorField title="Descrição" hint="Como o servidor começou? Por que entrar?">
        <textarea
          aria-label="Descrição do servidor"
          value={draft.description}
          maxLength={MAX_DESCRIPTION}
          rows={3}
          placeholder="Conte um pouco sobre este servidor."
          onChange={(e) => onChange({ description: e.target.value })}
          className="focus-ring w-full resize-y rounded-md border border-subtle bg-input px-3 py-2 text-ds-sm text-strong placeholder:text-faint"
        />
      </EditorField>
      <EditorField title="Jogos" hint="O que o servidor joga?">
        <GamesField serverId={serverId} selected={draft.games} onChange={(games) => onChange({ games })} />
      </EditorField>
      <PrivateField checked={draft.private} onChange={(value) => onChange({ private: value })} />
    </>
  )
}
