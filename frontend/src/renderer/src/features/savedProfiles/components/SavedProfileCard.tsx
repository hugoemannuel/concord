import Avatar from '../../../shared/ui/Avatar'
import { PencilIcon, RefreshIcon, TrashIcon } from '../../../shared/ui/icons'
import { API_BASE_URL } from '../../../shared/lib/config'
import StyledName from '../../profile/components/StyledName'
import { DEFAULT_BANNER, profileMediaSrc } from '../../profile/lib/profileMedia'
import type { SavedProfile } from '../lib/savedProfiles'

const ICON_BUTTON =
  'flex size-10 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-fg/10 hover:text-strong focus-ring disabled:cursor-wait disabled:opacity-50'

/** A faixa do banner (imagem, cor ou o degradê padrão) atrás do avatar. */
function BannerStrip({ item }: { item: SavedProfile }): React.JSX.Element {
  const banner = profileMediaSrc(item.banner_url, API_BASE_URL, { animate: false })
  return (
    <span
      aria-hidden="true"
      className="absolute inset-x-0 top-0 h-7"
      style={banner ? undefined : { background: item.fields.banner_color ?? DEFAULT_BANNER }}
    >
      {banner && <img src={banner} alt="" className="size-full object-cover" />}
    </span>
  )
}

/**
 * Um perfil salvo: tocar aplica; atualizar, lápis e lixeira ficam sempre à
 * mostra (no toque não há hover). Atualizar fica travado no que está em uso
 * (já é igual ao perfil atual). O que está em uso aparece marcado.
 */
export default function SavedProfileCard({
  item,
  current,
  busy,
  onApply,
  onRename,
  onUpdate,
  onDelete
}: {
  item: SavedProfile
  current: boolean
  /** Alguma ação dos perfis salvos está em andamento. */
  busy: boolean
  onApply: () => void
  onRename: () => void
  onUpdate: () => void
  onDelete: () => void
}): React.JSX.Element {
  const shown = item.fields.display_name
  return (
    <li
      className={`relative min-w-0 overflow-hidden rounded-xl border bg-fg/5 transition-colors ${
        current ? 'border-brand' : 'border-subtle hover:border-normal'
      }`}
    >
      <button
        type="button"
        onClick={onApply}
        disabled={busy || current}
        aria-label={current ? `${item.name} (em uso)` : `Usar o perfil ${item.name}`}
        className="flex w-full min-w-0 cursor-pointer flex-col items-start gap-1 px-3 pb-2.5 pt-3.5 text-left focus-ring-inset disabled:cursor-default"
      >
        <BannerStrip item={item} />
        <span className="relative rounded-full border-4 border-[var(--bg-floating)]">
          <Avatar name={shown} avatarUrl={item.avatar_url} size={40} animate="never" />
        </span>
        <span className="flex w-full min-w-0 items-center gap-2 pr-32">
          <span className="min-w-0 truncate text-ds-sm font-semibold text-strong">{item.name}</span>
          {current && (
            <span className="shrink-0 rounded-md bg-brand/20 px-1.5 py-0.5 text-ds-xs font-semibold text-strong">
              Em uso
            </span>
          )}
        </span>
        <span className="w-full min-w-0 truncate text-ds-xs text-muted">
          <StyledName name={shown} style={item.fields.name_style} />
        </span>
      </button>
      <div className="absolute bottom-1.5 right-1.5 flex">
        <button
          type="button"
          aria-label={`Atualizar ${item.name} com o perfil atual`}
          title={current ? 'Já está igual ao perfil atual' : 'Atualizar com o perfil atual'}
          disabled={busy || current}
          onClick={onUpdate}
          className={ICON_BUTTON}
        >
          <RefreshIcon className="size-4" />
        </button>
        <button
          type="button"
          aria-label={`Renomear ${item.name}`}
          title="Renomear"
          disabled={busy}
          onClick={onRename}
          className={ICON_BUTTON}
        >
          <PencilIcon className="size-4" />
        </button>
        <button
          type="button"
          aria-label={`Excluir ${item.name}`}
          title="Excluir"
          disabled={busy}
          onClick={onDelete}
          className={`${ICON_BUTTON} hover:text-danger`}
        >
          <TrashIcon className="size-4" />
        </button>
      </div>
    </li>
  )
}
