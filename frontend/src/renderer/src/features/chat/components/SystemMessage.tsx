import type { Message } from '../api/messages'
import { splitMentions } from '../lib/mentions'
import { useServerStore } from '../../servers/store/serverStore'
import MentionChip from './MentionChip'
import { MessageTime } from './MessageTime'

/**
 * Mensagem enviada pelo próprio servidor (ex.: feliz aniversário): aparece
 * com o nome do servidor, não de quem responde por ele, e com o nome do
 * servidor em destaque no texto.
 */
function SystemMessage({ message }: { message: Message }): React.JSX.Element {
  const serverName = useServerStore((s) => s.currentServer?.name) ?? 'Servidor'
  const marker = `O servidor ${serverName}`
  const at = message.content.indexOf(marker)

  const renderText = (text: string, offset: number): React.ReactNode[] =>
    splitMentions(text).map((part, i) =>
      part.mention ? (
        <MentionChip
          key={`${offset}-${i}`}
          mention={part.mention}
          displayText={part.text}
        />
      ) : (
        <span key={`${offset}-${i}`}>{part.text}</span>
      )
    )

  return (
    <div
      id={`msg-${message.id}`}
      className="mx-2 my-1 flex gap-3 rounded-lg border border-warning/20 bg-gradient-to-r from-warning/10 to-transparent px-3 py-2.5"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-warning to-danger text-ds-md font-bold text-white shadow-md">
        {serverName.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-ds-chat font-medium text-warning">{serverName}</span>
          <span className="rounded bg-warning/20 px-1 py-px text-ds-xxs font-bold uppercase tracking-wide text-warning">
            Servidor
          </span>
          <MessageTime iso={message.created_at} className="text-ds-xs font-medium text-faint" />
        </div>
        <p className="whitespace-pre-wrap break-words text-ds-chat text-strong">
          {at >= 0 ? (
            <>
              {renderText(message.content.slice(0, at), 0)}
              <strong className="font-semibold text-warning">{marker}</strong>
              {renderText(message.content.slice(at + marker.length), at + marker.length)}
            </>
          ) : (
            renderText(message.content, 0)
          )}
        </p>
      </div>
    </div>
  )
}

export default SystemMessage
