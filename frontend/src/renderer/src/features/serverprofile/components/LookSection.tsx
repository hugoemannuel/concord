import { API_BASE_URL } from '../../../shared/lib/config'
import { showToast } from '../../../shared/store/toastStore'
import Button from '../../../shared/ui/Button'
import { CheckIcon, ImageIcon, TrashIcon } from '../../../shared/ui/icons'
import { useRef } from 'react'
import { STARTERS } from '../../appearance/lib/starters'
import { THEME_IMAGE_ACCEPT } from '../../appearance/lib/themeImageFile'
import { useServerStore } from '../../servers/store/serverStore'
import type { ServerArt, ServerTheme } from '../api/serverProfile'
import { useProfileDraft } from '../hooks/useProfileDraft'
import { useProfileImageUpload } from '../hooks/useProfileImageUpload'
import { artBackground, resolveArt } from '../lib/serverArt'
import ArtPicker from './ArtPicker'
import ProfileEditorLayout, { EditorField, EditorLoading, UnsavedBar } from './ProfileEditorLayout'

const NO_STARTER = { id: '', label: 'Nenhum' }

function StarterPicker({ value, onChange }: { value: string; onChange: (starter: string) => void }): React.JSX.Element {
  return (
    <div role="group" aria-label="Ponto de partida do fundo" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {[NO_STARTER, ...STARTERS].map((starter) => (
        <button
          key={starter.id}
          type="button"
          aria-pressed={value === starter.id}
          onClick={() => onChange(starter.id)}
          className={`focus-ring flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-ds-sm text-strong transition-colors hover:bg-fg/10 ${
            value === starter.id ? 'border-brand bg-fg/10 ring-1 ring-brand' : 'border-subtle bg-fg/5'
          }`}
        >
          <span className="min-w-0 truncate">{starter.label}</span>
          {value === starter.id && <CheckIcon size={16} className="shrink-0" />}
        </button>
      ))}
    </div>
  )
}

function ThemeImageField({
  serverId,
  theme,
  onChange
}: {
  serverId: string
  theme: ServerTheme
  onChange: (next: ServerTheme) => void
}): React.JSX.Element {
  const fileRef = useRef<HTMLInputElement>(null)
  const upload = useProfileImageUpload(serverId, (image) => onChange({ ...theme, image }))
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" icon={ImageIcon} loading={upload.busy} onClick={() => fileRef.current?.click()}>
          {theme.image ? 'Trocar imagem' : 'Enviar imagem'}
        </Button>
        {theme.image && (
          <Button variant="ghost" size="sm" icon={TrashIcon} onClick={() => onChange({ ...theme, image: '' })}>
            Remover imagem
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept={THEME_IMAGE_ACCEPT}
          hidden
          aria-label="Arquivo da imagem de fundo"
          onChange={(e) => {
            void upload.pick(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
      {theme.image && (
        <label className="flex flex-col gap-1 text-ds-sm text-normal">
          Escurecer a imagem: {theme.dim}%
          <input
            type="range"
            min={0}
            max={100}
            value={theme.dim}
            onChange={(e) => onChange({ ...theme, dim: Number(e.target.value) })}
            className="focus-ring w-full cursor-pointer"
          />
        </label>
      )}
    </div>
  )
}

/** Como a barra de canais fica: a faixa no topo. */
function StripPreview({ strip, serverName }: { strip: ServerArt; serverName: string }): React.JSX.Element {
  const art = resolveArt(strip)
  return (
    <div className="overflow-hidden rounded-lg border border-subtle bg-secondary">
      <div
        className={`flex items-start px-4 text-ds-md font-semibold ${art ? 'h-24 pt-3 on-media text-white' : 'h-14 items-center text-strong'}`}
        style={art ? artBackground(art, API_BASE_URL) : undefined}
      >
        <span className="truncate">{serverName}</span>
      </div>
      <div className="space-y-1.5 p-3" aria-hidden="true">
        <div className="h-2.5 w-3/5 rounded bg-fg/15" />
        <div className="h-2.5 w-4/5 rounded bg-fg/10" />
        <div className="h-2.5 w-2/5 rounded bg-fg/10" />
      </div>
    </div>
  )
}

/** Seção "Faixa e fundo": o que quem está no servidor vê. */
export default function LookSection(): React.JSX.Element {
  const serverId = useServerStore((s) => s.currentServer?.id)
  return serverId ? <LookForm key={serverId} serverId={serverId} /> : <EditorLoading />
}

function LookForm({ serverId }: { serverId: string }): React.JSX.Element {
  const serverName = useServerStore((s) => s.currentServer?.name ?? '')
  const form = useProfileDraft(serverId)
  const { draft } = form
  if (!draft) return <EditorLoading />
  const save = async (): Promise<void> => {
    if (await form.save()) showToast.success('Faixa e fundo atualizados!')
  }
  return (
    <ProfileEditorLayout
      previewLabel="Topo da lista de canais"
      preview={<StripPreview strip={draft.strip} serverName={serverName} />}
      bar={form.dirty && <UnsavedBar saving={form.saving} onReset={form.reset} onSave={() => void save()} />}
    >
      <EditorField title="Faixa" hint="Fica no topo da lista de canais.">
        <ArtPicker serverId={serverId} label="Faixa" value={draft.strip} onChange={(strip) => form.change({ strip })} />
      </EditorField>
      <EditorField
        title="Tema de fundo"
        hint="Cada membro vê este fundo enquanto está no servidor; quem preferir desliga em Aparência, nas Configurações."
      >
        <StarterPicker value={draft.theme.starter} onChange={(starter) => form.change({ theme: { ...draft.theme, starter } })} />
      </EditorField>
      <EditorField title="Imagem de fundo">
        <ThemeImageField serverId={serverId} theme={draft.theme} onChange={(theme) => form.change({ theme })} />
      </EditorField>
    </ProfileEditorLayout>
  )
}
