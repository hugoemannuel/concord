import type { MessageFavorite } from '../api/messageFavorites'
import { favoriteOrigin, type FavoriteOriginLabel } from '../lib/favoriteTarget'
import type { Message } from '../../chat/api/messages'
import { formatMessageDateTime } from '../../chat/lib/messageDateTime'
import { messagePreviewParts } from '../../chat/lib/polls'
import PreviewText from '../../chat/components/PreviewText'
import Avatar from '../../../shared/ui/Avatar'
import IconButton from '../../../shared/ui/IconButton'
import {
  AtIcon,
  FriendsIcon,
  HashIcon,
  LockIcon,
  StarIcon,
  type IconProps
} from '../../../shared/ui/icons'

const CARD = 'flex items-start gap-2 rounded-lg border border-subtle bg-floating p-2'

const ORIGIN_ICON = { channel: HashIcon, dm: AtIcon, group: FriendsIcon }

/** A estrela cheia: a mensagem está nas favoritas. */
const FilledStarIcon = (props: IconProps): React.JSX.Element => <StarIcon filled {...props} />

/** De onde é: "# geral · Servidor", "@ Fulano" ou o grupo. */
function OriginLine({ origin }: { origin: FavoriteOriginLabel }): React.JSX.Element {
  const Icon = ORIGIN_ICON[origin.kind]
  return (
    <span className="flex min-w-0 items-center gap-1 text-ds-xs font-semibold text-muted">
      <Icon size={12} />
      <span className="truncate">
        {origin.title}
        {origin.detail && <span className="font-normal text-faint"> · {origin.detail}</span>}
      </span>
    </span>
  )
}

/** Texto (sem Markdown) em até 4 linhas; sem texto, o tipo numa linha (enquete, anexo…). */
function MessagePreview({ message }: { message: Message }): React.JSX.Element {
  const preview = messagePreviewParts(message)
  return preview.icon ? <PreviewText preview={preview} /> : <>{preview.text}</>
}

/** Autor, hora e a prévia do conteúdo (texto sem Markdown, ou o tipo: enquete, anexo…). */
function MessageSummary({ message }: { message: Message }): React.JSX.Element {
  const name = message.author?.display_name || message.author?.username || 'Usuário'
  return (
    <span className="mt-1.5 flex items-start gap-2.5">
      <Avatar
        userId={message.author_id}
        name={name}
        avatarUrl={message.author?.avatar_url}
        decorationUrl={message.author?.avatar_decoration_url}
        size={32}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-ds-sm font-semibold text-strong">{name}</span>
          <time dateTime={message.created_at} className="shrink-0 text-ds-xs text-faint">
            {formatMessageDateTime(message.created_at)}
          </time>
        </span>
        <span className="mt-0.5 line-clamp-4 block whitespace-pre-wrap break-words text-ds-sm text-normal">
          <MessagePreview message={message} />
        </span>
      </span>
    </span>
  )
}

function RemoveButton({ onRemove }: { onRemove: () => void }): React.JSX.Element {
  return (
    <IconButton
      icon={FilledStarIcon}
      label="Remover das favoritas"
      size="md"
      className="text-warning"
      onClick={onRemove}
    />
  )
}

/** Favorita de sala que a pessoa não lê mais: sem conteúdo, só o aviso e o remover. */
function UnavailableItem({ onRemove }: { onRemove: () => void }): React.JSX.Element {
  return (
    <div className={CARD}>
      <span className="flex min-w-0 flex-1 items-start gap-2.5 p-1">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-fg/5 text-muted">
          <LockIcon size={16} />
        </span>
        <span className="min-w-0">
          <span className="block text-ds-sm font-medium text-normal">Mensagem indisponível</span>
          <span className="block text-ds-xs text-muted">
            Você não tem mais acesso a essa conversa.
          </span>
        </span>
      </span>
      <RemoveButton onRemove={onRemove} />
    </div>
  )
}

/** Um item da lista de favoritas: abre a mensagem no chat ou sai da lista. */
export default function FavoriteItem({
  favorite,
  onOpen,
  onRemove
}: {
  favorite: MessageFavorite
  onOpen: () => void
  onRemove: () => void
}): React.JSX.Element {
  const { message } = favorite
  if (favorite.unavailable || !message) return <UnavailableItem onRemove={onRemove} />
  return (
    <div className={`${CARD} transition hover:border-normal hover:bg-surface`}>
      <button
        type="button"
        onClick={onOpen}
        title="Ir para a mensagem"
        className="focus-ring min-w-0 flex-1 cursor-pointer rounded-md p-1 text-left"
      >
        <OriginLine origin={favoriteOrigin(favorite)} />
        <MessageSummary message={message} />
      </button>
      <RemoveButton onRemove={onRemove} />
    </div>
  )
}
