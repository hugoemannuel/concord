import type { SearchResult } from '../api/search'
import { highlightParts } from '../lib/messageSearch'
import { messagePreviewParts } from '../lib/polls'
import { serverDisplayName } from '../../servers/lib/serverNames'
import { useServerMemberColor } from '../../servers/hooks/useServerNames'
import Avatar from '../../../shared/ui/Avatar'
import { HashIcon } from '../../../shared/ui/icons'
import PreviewText from './PreviewText'

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/** Texto do resultado com os termos marcados; sem texto, a prévia (enquete, anexo…). */
function ResultBody({ result, terms }: { result: SearchResult; terms: string[] }): React.JSX.Element {
  if (!result.content) return <PreviewText preview={messagePreviewParts(result)} />
  return (
    <>
      {highlightParts(result.content, terms).map((p, i) =>
        p.match ? (
          <mark key={i} className="rounded bg-warning/30 px-0.5 text-warning">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  )
}

/** Com texto, o que mais a mensagem tem (enquete, anexo…) vem embaixo. */
function ResultExtra({ result }: { result: SearchResult }): React.JSX.Element | null {
  if (!result.content) return null
  const extra = messagePreviewParts({ ...result, content: '' })
  if (!extra.text) return null
  return (
    <span className="mt-1 flex text-ds-xs text-muted">
      <PreviewText preview={extra} />
    </span>
  )
}


/** Um resultado da busca: canal, autor, hora e o texto com os termos marcados. */
export default function SearchResultItem({
  result,
  terms,
  serverId,
  nickname,
  onOpen
}: {
  result: SearchResult
  terms: string[]
  serverId?: string
  nickname?: string
  onOpen: () => void
}): React.JSX.Element {
  const name = serverDisplayName({ nickname }, result.author, 'Usuário')
  const color = useServerMemberColor(serverId, result.author_id)

  return (
    <button
      type="button"
      onClick={onOpen}
      title="Ir para a mensagem"
      className="group w-full cursor-pointer rounded-lg border border-subtle bg-floating p-3 text-left transition hover:border-normal hover:bg-surface focus-visible:outline-2 focus-visible:outline-brand"
    >
      {result.channel_name && (
        <span className="mb-1.5 flex items-center gap-1 text-ds-xs font-semibold text-muted">
          <HashIcon className="h-3 w-3" />
          {result.channel_name}
        </span>
      )}
      <span className="flex items-start gap-2.5">
        <Avatar
          userId={result.author_id}
          name={name}
          avatarUrl={result.author?.avatar_url}
          decorationUrl={result.author?.avatar_decoration_url}
          size={32}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span
              style={color ? { color } : undefined}
              className={`truncate text-ds-sm font-semibold ${color ? '' : 'text-strong'}`}
            >
              {name}
            </span>
            <time dateTime={result.created_at} className="shrink-0 text-ds-xs text-faint">
              {formatDateTime(result.created_at)}
            </time>
          </span>
          <span className="mt-0.5 line-clamp-6 block whitespace-pre-wrap break-words text-ds-sm text-normal">
            <ResultBody result={result} terms={terms} />
          </span>
          <ResultExtra result={result} />
        </span>
      </span>
    </button>
  )
}
