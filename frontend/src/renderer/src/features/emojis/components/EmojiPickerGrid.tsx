import { useEffect, useMemo, type ReactNode } from 'react'
import { EMOTE_CATEGORIES, type EmoteCategory, type EmoteItem } from '../../chat/lib/emotes'
import { useAuthStore } from '../../auth/store/authStore'
import { useServerStore } from '../../servers/store/serverStore'
import { ClockIcon, SmileyIcon, TrashIcon } from '../../../shared/ui/icons'
import { showToast } from '../../../shared/store/toastStore'
import type { CustomEmoji as Emoji, ServerEmojis } from '../api/emojis'
import { messageToken, reactionToken } from '../lib/emojiToken'
import { searchCategories } from '../lib/baseEmojis'
import { EXTERNAL_REASON, frequentItems, serverSections, withItemServers, type ServerSection } from '../lib/pickerSections'
import { useEmojiStore } from '../store/emojiStore'
import { rankedRecent, useRecentExpressions } from '../store/recentExpressions'
import { useCustomEmojis } from '../hooks/useCustomEmojis'
import { useExternalAccess, type PickerDestination } from '../hooks/useExternalAccess'
import CustomEmoji from './CustomEmoji'
import ExpressionPicker, { PickerSection, previewKeyProps, type PickerPreview, type PickerRailEntry } from './ExpressionPicker'
import ServerBadge from './ServerBadge'

/** No texto vai <:nome:id>; na reação, <:id>. */
export type EmojiPickMode = 'message' | 'reaction'

const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-1 max-md:grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))]'
const CELL =
  'flex h-9 w-full items-center justify-center rounded-md text-ds-lg transition-colors focus-ring max-md:h-11 max-md:text-ds-xl'
const CELL_ENABLED = 'cursor-pointer hover:bg-fg/10'
const CELL_DISABLED = 'cursor-not-allowed opacity-40'
/** Altura de uma linha da grade (botão + espaço), para reservar o lugar do que não montou. */
const ROW_PX = 36
const HEADER_PX = 28
const ROW_ITEMS = 6
/** As primeiras seções montam na hora; as outras quando chegam perto da tela. */
const EAGER_SERVERS = 3
const EAGER_CATEGORIES = 2
const FREQUENT_LIMIT = 18
const FREQUENT_ID = 'emoji:frequent'
const BASE_PREFIX = 'emoji:base:'
const customKey = (id: string): string => `custom:${id}`

const sectionHeight = (count: number): number => HEADER_PX + Math.ceil(count / ROW_ITEMS) * ROW_PX

type FrequentItem = { custom: Emoji } | { unicode: EmoteItem }

function CustomEmojiCell({
  emoji,
  disabled,
  onPick,
  onDelete
}: {
  emoji: Emoji
  disabled: boolean
  onPick: (emoji: Emoji) => void
  onDelete?: (emoji: Emoji) => void
}): React.JSX.Element {
  return (
    <div className="group relative">
      <button
        type="button"
        title={disabled ? EXTERNAL_REASON : `:${emoji.name}:`}
        aria-label={`:${emoji.name}:`}
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (!disabled) onPick(emoji)
        }}
        className={`${CELL} ${disabled ? CELL_DISABLED : CELL_ENABLED}`}
        {...previewKeyProps(customKey(emoji.id))}
      >
        <CustomEmoji id={emoji.id} name={emoji.name} size="picker" />
      </button>
      {onDelete && (
        <button
          type="button"
          title="Excluir emoji"
          aria-label="Excluir emoji"
          onClick={() => onDelete(emoji)}
          className="absolute -right-1 -top-1 rounded bg-black/80 p-0.5 text-danger opacity-80 hover:opacity-100 focus-visible:opacity-100 focus-ring [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-80"
        >
          <TrashIcon aria-hidden className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  )
}

function UnicodeCell({ item, onPick }: { item: EmoteItem; onPick: (value: string) => void }): React.JSX.Element {
  return (
    <button
      type="button"
      title={item.label}
      aria-label={item.label}
      onClick={() => onPick(item.emoji)}
      className={`${CELL} ${CELL_ENABLED}`}
      {...previewKeyProps(item.emoji)}
    >
      {item.emoji}
    </button>
  )
}

/** Tudo que a grade precisa saber, já calculado a partir dos stores. */
function usePickerData(
  search: string,
  customs: boolean,
  destination: PickerDestination
): {
  sections: ServerSection<Emoji>[]
  categories: EmoteCategory[]
  frequent: FrequentItem[]
  serverOf: Map<string, ServerEmojis>
  unicode: Map<string, EmoteItem>
  allowed: boolean
} {
  useCustomEmojis()
  const groups = useEmojiStore((s) => s.groups)
  const byId = useEmojiStore((s) => s.byId)
  const base = useEmojiStore((s) => s.base)
  const servers = useServerStore((s) => s.servers)
  const meId = useAuthStore((s) => s.user?.id)
  const recent = useRecentExpressions((s) => s.emoji)
  const allowed = useExternalAccess(destination)
  useEffect(() => void useEmojiStore.getState().ensureBase(), [])
  useEffect(() => useRecentExpressions.getState().load(meId), [meId])

  const sections = useMemo(() => {
    if (!customs) return []
    const itemServers = groups.map((g) => ({ id: g.server_id, name: g.server_name, icon_url: g.server_icon_url }))
    const items = new Map(groups.map((g) => [g.server_id, g.emojis]))
    return serverSections({
      servers: withItemServers(servers ?? [], itemServers),
      itemsOf: (id) => items.get(id) ?? [],
      nameOf: (e: Emoji) => e.name,
      currentId: destination.serverId,
      search
    })
  }, [customs, groups, servers, destination.serverId, search])

  const allCategories = base ?? EMOTE_CATEGORIES
  const categories = useMemo(() => searchCategories(allCategories, search), [allCategories, search])
  const unicode = useMemo(
    () => new Map(allCategories.flatMap((c) => c.items.map((i): [string, EmoteItem] => [i.emoji, i]))),
    [allCategories]
  )
  const frequent = useMemo(() => {
    const lookup = (key: string): FrequentItem | undefined => {
      if (key.startsWith('custom:')) {
        const emoji = customs ? byId[key.slice('custom:'.length)] : undefined
        return emoji && { custom: emoji }
      }
      const item = unicode.get(key)
      return item && { unicode: item }
    }
    const defaults = EMOTE_CATEGORIES[0].items.map((i) => i.emoji)
    return frequentItems(rankedRecent(recent), lookup, defaults, FREQUENT_LIMIT)
  }, [recent, byId, unicode, customs])

  const serverOf = useMemo(() => new Map(groups.flatMap((g) => g.emojis.map((e): [string, ServerEmojis] => [e.id, g]))), [groups])
  return { sections, categories, frequent, serverOf, unicode, allowed }
}

/**
 * Seletor de emoji: trilho e seções dos servidores da pessoa (o atual primeiro),
 * os usados com frequência e o pack base. Item de outro servidor fica
 * desabilitado, com o motivo, sem a permissão de usá-los aqui.
 */
export default function EmojiPickerGrid({
  search,
  mode,
  onPick,
  canDelete,
  destination = {},
  customs = true,
  header
}: {
  search: string
  mode: EmojiPickMode
  onPick: (value: string) => void
  /** Pode apagar este emoji daqui? (sem: nenhuma lixeira) */
  canDelete?: (emoji: Emoji) => boolean
  /** Para onde vai: decide o que é de fora e a permissão. Vazio = DM ou grupo. */
  destination?: PickerDestination
  /** Sem os personalizados (onde eles não são aceitos, como nas propostas). */
  customs?: boolean
  header?: ReactNode
}): React.JSX.Element {
  const remove = useEmojiStore((s) => s.remove)
  const record = useRecentExpressions((s) => s.record)
  const { sections, categories, frequent, serverOf, unicode, allowed } = usePickerData(search, customs, destination)
  const searching = search.trim() !== ''

  const pickUnicode = (value: string): void => {
    record('emoji', value)
    onPick(value)
  }
  const pickCustom = (e: Emoji): void => {
    record('emoji', customKey(e.id))
    onPick(mode === 'message' ? messageToken(e) : reactionToken(e.id))
  }
  const deleteCustom = (e: Emoji): void =>
    void remove(e.server_id, e.id).catch(() => showToast.error('Não foi possível excluir o emoji.'))
  const isDisabled = (e: Emoji): boolean => !allowed && e.server_id !== destination.serverId
  const deletable = (e: Emoji): ((emoji: Emoji) => void) | undefined => (canDelete?.(e) ? deleteCustom : undefined)

  const shownCategories = searching ? categories : categories.filter((c) => c.id !== EMOTE_CATEGORIES[0].id)
  const rail: PickerRailEntry[] = [
    ...(searching ? [] : [{ sectionId: FREQUENT_ID, label: 'Usados com frequência', icon: <ClockIcon size={20} /> }]),
    ...sections.map((s) => ({
      sectionId: `emoji:${s.server.id}`,
      label: s.server.name,
      icon: <ServerBadge name={s.server.name} iconUrl={s.server.icon_url} />
    })),
    ...(shownCategories.length
      ? [
          {
            sectionId: `${BASE_PREFIX}${shownCategories[0].id}`,
            label: 'Emojis padrão',
            icon: <SmileyIcon size={20} />,
            matches: (id: string) => id.startsWith(BASE_PREFIX)
          }
        ]
      : [])
  ]

  const describe = (key: string): PickerPreview | null => {
    if (key.startsWith('custom:')) {
      const id = key.slice('custom:'.length)
      const group = serverOf.get(id)
      const emoji = group?.emojis.find((e) => e.id === id)
      if (!group || !emoji) return null
      return {
        media: <CustomEmoji id={id} name={emoji.name} size="picker" />,
        title: `:${emoji.name}:`,
        detail: `de ${group.server_name}`,
        reason: isDisabled(emoji) ? EXTERNAL_REASON : undefined
      }
    }
    return { media: key, title: unicode.get(key)?.label ?? key }
  }

  const hasExternal = sections.some((s) => s.external && s.items.length > 0)
  const nothing = sections.length === 0 && categories.length === 0

  return (
    <ExpressionPicker
      rail={rail}
      header={header}
      notice={!allowed && hasExternal ? EXTERNAL_REASON : undefined}
      describe={describe}
      idleHint="Passe o mouse ou toque em um emoji para ver de onde ele vem."
    >
      {!searching && frequent.length > 0 && (
        <PickerSection id={FREQUENT_ID} title="Usados com frequência" icon={<ClockIcon size={12} />} eager estimatedHeight={sectionHeight(frequent.length)}>
          <div className={GRID}>
            {frequent.map((item) =>
              'custom' in item ? (
                <CustomEmojiCell key={item.custom.id} emoji={item.custom} disabled={isDisabled(item.custom)} onPick={pickCustom} />
              ) : (
                <UnicodeCell key={item.unicode.emoji} item={item.unicode} onPick={pickUnicode} />
              )
            )}
          </div>
        </PickerSection>
      )}
      {sections.map((section, i) => (
        <PickerSection
          key={section.server.id}
          id={`emoji:${section.server.id}`}
          title={section.server.name}
          icon={<ServerBadge name={section.server.name} iconUrl={section.server.icon_url} size="xs" />}
          eager={searching || i < EAGER_SERVERS}
          estimatedHeight={sectionHeight(section.items.length)}
        >
          {section.items.length === 0 ? (
            <p className="py-1 text-ds-xs text-faint">Este servidor ainda não tem emojis.</p>
          ) : (
            <div className={GRID}>
              {section.items.map((e) => (
                <CustomEmojiCell key={e.id} emoji={e} disabled={isDisabled(e)} onPick={pickCustom} onDelete={deletable(e)} />
              ))}
            </div>
          )}
        </PickerSection>
      ))}
      {shownCategories.map((category, i) => (
        <PickerSection
          key={category.id}
          id={`${BASE_PREFIX}${category.id}`}
          title={category.name}
          eager={searching || i < EAGER_CATEGORIES}
          estimatedHeight={sectionHeight(category.items.length)}
        >
          <div className={GRID}>
            {category.items.map((item) => (
              <UnicodeCell key={item.emoji} item={item} onPick={pickUnicode} />
            ))}
          </div>
        </PickerSection>
      ))}
      {nothing && <div className="py-4 text-center text-ds-xs text-faint">Nenhum emote encontrado</div>}
    </ExpressionPicker>
  )
}
