import { useEffect, useMemo } from 'react'
import type { ServerSticker } from '../api/stickers'
import { useStickerStore } from '../store/stickerStore'
import { useAuthStore } from '../../auth/store/authStore'
import { useServerStore } from '../../servers/store/serverStore'
import { useServerAccess } from '../../servers/hooks/useServerAccess'
import { Perm } from '../../servers/lib/permissions'
import { showToast } from '../../../shared/store/toastStore'
import { useStickerSrc } from '../hooks/useStickerSrc'
import { ClockIcon, PlusIcon, TrashIcon } from '../../../shared/ui/icons'
import ExpressionPicker, {
  PickerSection,
  previewKeyProps,
  type PickerPreview,
  type PickerRailEntry
} from '../../emojis/components/ExpressionPicker'
import ServerBadge from '../../emojis/components/ServerBadge'
import { EXTERNAL_REASON, frequentItems, serverSections } from '../../emojis/lib/pickerSections'
import { useExternalAccess, type PickerDestination } from '../../emojis/hooks/useExternalAccess'
import { rankedRecent, useRecentExpressions } from '../../emojis/store/recentExpressions'

const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-2'
const ROW_PX = 88
const HEADER_PX = 28
const ROW_ITEMS = 3
const EAGER_SECTIONS = 2
const FREQUENT_LIMIT = 6
const FREQUENT_ID = 'sticker:frequent'
const NO_SERVERS: { id: string; name: string; icon_url?: string | null }[] = []

const sectionHeight = (count: number): number => HEADER_PX + Math.max(Math.ceil(count / ROW_ITEMS), 1) * ROW_PX

function StickerImage({ sticker }: { sticker: ServerSticker }): React.JSX.Element {
  const src = useStickerSrc(sticker.id)
  if (!src) return <div className="h-10 w-10 animate-pulse rounded bg-fg/10" />
  return <img src={src} alt={sticker.name} loading="lazy" decoding="async" className="h-full w-full object-contain" draggable={false} />
}

function StickerItem({
  sticker,
  disabled,
  canDelete,
  onSelect,
  onDelete
}: {
  sticker: ServerSticker
  disabled: boolean
  canDelete: boolean
  onSelect: (stk: ServerSticker) => void
  onDelete: (stk: ServerSticker) => void
}): React.JSX.Element {
  return (
    <div className="group relative flex aspect-square items-center justify-center rounded-xl bg-fg/5 p-1 transition-colors hover:bg-fg/10">
      <button
        type="button"
        title={disabled ? EXTERNAL_REASON : sticker.name}
        aria-label={sticker.name}
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (!disabled) onSelect(sticker)
        }}
        className={`focus-ring flex h-full w-full items-center justify-center rounded-lg ${
          disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
        }`}
        {...previewKeyProps(sticker.id)}
      >
        <StickerImage sticker={sticker} />
      </button>
      {canDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(sticker)
          }}
          title="Excluir figurinha"
          aria-label="Excluir figurinha"
          className="focus-ring absolute right-1 top-1 rounded-md bg-black/80 p-1 text-danger opacity-80 hover:opacity-100 focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-80"
        >
          <TrashIcon aria-hidden className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

/** Contador e "Nova figurinha" do servidor atual. */
function ServerStickerBar({ count, canAdd, onAdd }: { count: number; canAdd: boolean; onAdd: () => void }): React.JSX.Element {
  return (
    <div className="mb-2 flex shrink-0 items-center justify-between">
      <span className="text-ds-xs text-muted">{count} / 60 figurinhas</span>
      {canAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="focus-ring flex min-h-7 cursor-pointer items-center gap-1 rounded-md bg-brand/30 px-2 py-1 text-ds-xs font-medium text-brand transition-colors hover:bg-brand/50 max-md:min-h-9"
        >
          <PlusIcon className="h-3 w-3" />
          <span>Nova figurinha</span>
        </button>
      )}
    </div>
  )
}

/**
 * Aba "Figurinhas" do seletor de mídia: trilho e seções dos servidores da
 * pessoa, o atual primeiro. Figurinha de outro servidor fica desabilitada, com
 * o motivo, sem a permissão de usá-las aqui.
 */
export default function StickersTab({
  serverId,
  channelId,
  search,
  onAdd,
  onSelectSticker
}: PickerDestination & {
  search: string
  onAdd: () => void
  onSelectSticker: (sticker: ServerSticker) => void
}): React.JSX.Element {
  const stickersByServer = useStickerStore((s) => s.stickersByServer)
  const deleteSticker = useStickerStore((s) => s.deleteSticker)
  const servers = useServerStore((s) => s.servers) ?? NO_SERVERS
  const currentUserId = useAuthStore((s) => s.user?.id)
  const viewingServer = useServerStore((s) => Boolean(serverId && s.currentServer?.id === serverId))
  const access = useServerAccess()
  const allowed = useExternalAccess({ serverId, channelId })
  const recent = useRecentExpressions((s) => s.sticker)
  const record = useRecentExpressions((s) => s.record)
  useEffect(() => useRecentExpressions.getState().load(currentUserId), [currentUserId])

  const canModerate = viewingServer && access.can(Perm.MANAGE_EXPRESSIONS)
  // Só dá para conferir cargos do servidor aberto; em outro, o servidor decide.
  const canAdd = !viewingServer || access.can(Perm.ADD_STICKERS)
  const searching = search.trim() !== ''

  const sections = useMemo(
    () =>
      serverSections({
        servers,
        itemsOf: (id) => stickersByServer[id] ?? [],
        nameOf: (s: ServerSticker) => s.name,
        currentId: serverId,
        search
      }),
    [servers, stickersByServer, serverId, search]
  )
  const byId = useMemo(
    () => new Map(Object.values(stickersByServer).flat().map((s): [string, ServerSticker] => [s.id, s])),
    [stickersByServer]
  )
  const frequent = useMemo(
    () => frequentItems(rankedRecent(recent), (id) => byId.get(id), [], FREQUENT_LIMIT),
    [recent, byId]
  )
  const serverOf = (id: string): (typeof servers)[number] | undefined => servers.find((s) => s.id === id)

  const isDisabled = (s: ServerSticker): boolean => !allowed && s.server_id !== serverId
  const pick = (s: ServerSticker): void => {
    record('sticker', s.id)
    onSelectSticker(s)
  }
  const handleDelete = (toDelete: ServerSticker): void => {
    deleteSticker(toDelete.server_id, toDelete.id).catch((err) => {
      showToast.error(err instanceof Error ? err.message : 'Não foi possível excluir a figurinha.')
    })
  }
  const canDeleteSticker = (s: ServerSticker): boolean =>
    s.uploader_id === currentUserId || (s.server_id === serverId && canModerate)

  const rail: PickerRailEntry[] = [
    ...(!searching && frequent.length ? [{ sectionId: FREQUENT_ID, label: 'Usados com frequência', icon: <ClockIcon size={20} /> }] : []),
    ...sections.map((s) => ({
      sectionId: `sticker:${s.server.id}`,
      label: s.server.name,
      icon: <ServerBadge name={s.server.name} iconUrl={s.server.icon_url} />
    }))
  ]

  const describe = (key: string): PickerPreview | null => {
    const sticker = byId.get(key)
    if (!sticker) return null
    const server = serverOf(sticker.server_id)
    return {
      media: <StickerImage sticker={sticker} />,
      title: sticker.name,
      detail: server ? `de ${server.name}` : undefined,
      reason: isDisabled(sticker) ? EXTERNAL_REASON : undefined,
      aside: server && <ServerBadge name={server.name} iconUrl={server.icon_url} />
    }
  }

  const renderItem = (s: ServerSticker): React.JSX.Element => (
    <StickerItem key={s.id} sticker={s} disabled={isDisabled(s)} canDelete={canDeleteSticker(s)} onSelect={pick} onDelete={handleDelete} />
  )
  const hasExternal = sections.some((s) => s.external && s.items.length > 0)

  return (
    <ExpressionPicker
      rail={rail}
      header={serverId && <ServerStickerBar count={stickersByServer[serverId]?.length ?? 0} canAdd={canAdd} onAdd={onAdd} />}
      notice={!allowed && hasExternal ? EXTERNAL_REASON : undefined}
      describe={describe}
      idleHint="Passe o mouse ou toque em uma figurinha para ver de onde ela vem."
    >
      {!searching && frequent.length > 0 && (
        <PickerSection id={FREQUENT_ID} title="Usados com frequência" icon={<ClockIcon size={12} />} eager estimatedHeight={sectionHeight(frequent.length)}>
          <div className={GRID}>{frequent.map(renderItem)}</div>
        </PickerSection>
      )}
      {sections.map((section, i) => (
        <PickerSection
          key={section.server.id}
          id={`sticker:${section.server.id}`}
          title={section.server.name}
          icon={<ServerBadge name={section.server.name} iconUrl={section.server.icon_url} size="xs" />}
          eager={searching || i < EAGER_SECTIONS}
          estimatedHeight={sectionHeight(section.items.length)}
        >
          {section.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 p-4 text-center text-ds-xs text-faint">
              <span>Nenhuma figurinha no servidor ainda.</span>
              {canAdd && (
                <button
                  type="button"
                  onClick={onAdd}
                  className="focus-ring cursor-pointer rounded-lg bg-fg/10 px-3 py-1.5 text-ds-xs text-strong transition-colors hover:bg-fg/20"
                >
                  Adicionar a primeira
                </button>
              )}
            </div>
          ) : (
            <div className={GRID}>{section.items.map(renderItem)}</div>
          )}
        </PickerSection>
      ))}
      {sections.length === 0 && (
        <div className="p-4 text-center text-ds-xs text-faint">
          {searching ? 'Nenhuma figurinha encontrada.' : 'Nenhuma figurinha nos seus servidores ainda.'}
        </div>
      )}
    </ExpressionPicker>
  )
}
