import { showToast } from '../../../shared/store/toastStore'
import Button from '../../../shared/ui/Button'
import { CheckIcon, TAG_BADGES, TagBadgeIcon, TrashIcon } from '../../../shared/ui/icons'
import Input from '../../../shared/ui/Input'
import Avatar from '../../../shared/ui/Avatar'
import { useAuthStore } from '../../auth/store/authStore'
import { useServerStore } from '../../servers/store/serverStore'
import { useProfileDraft } from '../hooks/useProfileDraft'
import { DEFAULT_TAG, MAX_TAG_NAME, TAG_COLORS, cleanTagName, tagProblem, tagRenameWarning } from '../lib/tagRules'
import ProfileEditorLayout, { EditorField, EditorLoading, UnsavedBar } from './ProfileEditorLayout'
import { ServerTagPreview } from './ServerTagChip'
import type { TagEdit } from '../api/serverProfile'

const PICK = 'focus-ring relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-md border transition-colors hover:bg-fg/10'
const pickState = (selected: boolean): string => (selected ? 'border-brand bg-fg/10 ring-1 ring-brand' : 'border-subtle bg-fg/5')

function BadgePicker({ tag, onChange }: { tag: TagEdit; onChange: (badge: string) => void }): React.JSX.Element {
  return (
    <div role="group" aria-label="Emblema" className="flex flex-wrap gap-2">
      {TAG_BADGES.map((badge) => (
        <button
          key={badge.id}
          type="button"
          aria-pressed={tag.badge === badge.id}
          aria-label={badge.label}
          title={badge.label}
          onClick={() => onChange(badge.id)}
          style={{ color: tag.color }}
          className={`${PICK} ${pickState(tag.badge === badge.id)}`}
        >
          <TagBadgeIcon badge={badge.id} size={24} />
        </button>
      ))}
    </div>
  )
}

function ColorPicker({ tag, onChange }: { tag: TagEdit; onChange: (color: string) => void }): React.JSX.Element {
  return (
    <div role="group" aria-label="Cor" className="flex flex-wrap items-center gap-2">
      {TAG_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          aria-pressed={tag.color === color}
          aria-label={`Cor ${color}`}
          onClick={() => onChange(color)}
          style={{ backgroundColor: color }}
          className={`${PICK} text-black ${tag.color === color ? 'border-brand ring-1 ring-brand' : 'border-subtle'}`}
        >
          {tag.color === color && <CheckIcon size={16} />}
        </button>
      ))}
      <label className="flex h-11 cursor-pointer items-center gap-2 rounded-md border border-subtle bg-fg/5 px-2 text-ds-sm text-normal focus-within:ring-2 focus-within:ring-brand">
        <input
          type="color"
          value={tag.color}
          aria-label="Outra cor"
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-7 cursor-pointer rounded bg-transparent"
        />
        Outra
      </label>
    </div>
  )
}

/** Uma mensagem de exemplo, como a tag aparece no chat. */
function TagPreviewCard({ tag }: { tag: TagEdit }): React.JSX.Element {
  const user = useAuthStore((s) => s.user)
  const name = user?.display_name || user?.username || 'Você'
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-lg border border-subtle bg-floating p-3">
      <Avatar userId={user?.id ?? 'previa'} name={name} avatarUrl={user?.avatar_url} size={40} animate="never" />
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="truncate text-ds-sm font-semibold text-strong">{name}</span>
          {tag.name ? <ServerTagPreview tag={tag} /> : <span className="text-ds-xs text-faint">sem tag</span>}
        </div>
        <p className="mt-0.5 text-ds-sm text-normal">Olha a tag do servidor!</p>
      </div>
    </div>
  )
}

/** Seção "Tag do servidor": nome, emblema e cor, com a prévia no chat. */
export default function TagSection(): React.JSX.Element {
  const serverId = useServerStore((s) => s.currentServer?.id)
  return serverId ? <TagForm key={serverId} serverId={serverId} /> : <EditorLoading />
}

function TagForm({ serverId }: { serverId: string }): React.JSX.Element {
  const form = useProfileDraft(serverId)
  const { draft, card } = form
  if (!draft || !card?.profile) return <EditorLoading />
  const { tag } = draft
  const saved = card.profile.tag
  const problem = tagProblem(tag)
  const setTag = (next: Partial<TagEdit>): void => form.change({ tag: { ...tag, ...next } })
  const save = async (): Promise<void> => {
    if (await form.save()) showToast.success('Tag atualizada!')
  }

  return (
    <ProfileEditorLayout
      previewLabel="Como aparece nas mensagens"
      preview={<TagPreviewCard tag={tag} />}
      bar={
        form.dirty && (
          <UnsavedBar saving={form.saving} canSave={!problem} onReset={form.reset} onSave={() => void save()} />
        )
      }
    >
      <p className="text-ds-sm text-muted">
        Os membros podem mostrar esta tag ao lado do nome, em qualquer lugar, escolhendo em Perfis, nas Configurações.
        Quem clica nela vê o cartão do servidor.
      </p>
      {card.profile.private && (
        <p className="rounded-md border border-subtle bg-fg/5 px-3 py-2 text-ds-sm text-normal">
          O perfil do servidor está privado: quem está fora e clica na tag vê apenas “Servidor privado”.
        </p>
      )}
      <EditorField title="Nome" hint={`Até ${MAX_TAG_NAME} caracteres, só letras e números.`}>
        <div className="flex flex-wrap items-start gap-2">
          <div className="w-32">
            <Input
              aria-label="Nome da tag"
              value={tag.name}
              placeholder="TAG"
              onChange={(e) => setTag({ name: cleanTagName(e.target.value) })}
            />
          </div>
          {saved && (
            <Button
              variant="ghost"
              icon={TrashIcon}
              onClick={() => form.change({ tag: { ...DEFAULT_TAG, name: '' } })}
            >
              Remover tag
            </Button>
          )}
        </div>
        {tagRenameWarning(saved, tag) && (
          <p role="alert" className="mt-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-ds-sm text-normal">
            Ao mudar o nome ou remover a tag, ela sai do perfil de todos os membros e cada um precisa
            aplicar de novo. Isso evita abusos.
          </p>
        )}
      </EditorField>
      <EditorField title="Emblema" hint="Mudar só o emblema não tira a tag dos membros.">
        <BadgePicker tag={tag} onChange={(badge) => setTag({ badge })} />
      </EditorField>
      <EditorField title="Cor" hint="Mudar só a cor também não.">
        <ColorPicker tag={tag} onChange={(color) => setTag({ color })} />
      </EditorField>
    </ProfileEditorLayout>
  )
}
