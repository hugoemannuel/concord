import { useEffect, useState } from 'react'
import { showToast } from '../../../shared/store/toastStore'
import { CheckIcon } from '../../../shared/ui/icons'
import { useAuthStore } from '../../auth/store/authStore'
import { serverIconSrc } from '../../servers/lib/serverIcon'
import { getMyServerTags, type ServerTag, type TagOption } from '../api/serverProfile'
import { chooseMyTag } from '../lib/draftRequests'
import { useServerTagStore } from '../store/serverTagStore'
import { ServerTagPreview } from './ServerTagChip'

const ROW =
  'focus-ring flex min-h-11 w-full min-w-0 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors hover:bg-fg/10'
const rowState = (on: boolean): string => (on ? 'border-brand bg-fg/10' : 'border-subtle bg-fg/5')

function OptionIcon({ option }: { option: TagOption }): React.JSX.Element {
  const src = serverIconSrc(option.server_icon_url)
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-tertiary text-ds-sm font-bold text-strong">
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : option.server_name.charAt(0).toUpperCase()}
    </span>
  )
}

/** Configurações → Perfis: qual tag de servidor mostrar (uma por vez). */
export default function MyServerTagPicker(): React.JSX.Element | null {
  const me = useAuthStore((s) => s.user?.id)
  const [options, setOptions] = useState<TagOption[] | null>(null)
  const [current, setCurrent] = useState<ServerTag | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    getMyServerTags()
      .then((mine) => {
        if (cancelled) return
        setOptions(mine.options)
        setCurrent(mine.current)
      })
      .catch(() => {
        if (!cancelled) setOptions([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const choose = async (serverId: string | null): Promise<void> => {
    setBusy(true)
    try {
      const tag = await chooseMyTag(serverId)
      setCurrent(tag)
      if (me) useServerTagStore.getState().setUserTag(me, tag)
    } catch {
      showToast.error('Não foi possível trocar a tag. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  return options ? <MyTagList options={options} current={current} busy={busy} onChoose={(id) => void choose(id)} /> : null
}

/** A lista de tags (fora do componente que busca, para testar). */
export function MyTagList({
  options,
  current,
  busy,
  onChoose
}: {
  options: TagOption[]
  current: ServerTag | null
  busy: boolean
  onChoose: (serverId: string | null) => void
}): React.JSX.Element {
  return (
    <section aria-labelledby="tag-servidor-titulo" className="flex flex-col gap-3">
      <div>
        <h3 id="tag-servidor-titulo" className="text-ds-md font-semibold text-strong">
          Tag do servidor
        </h3>
        <p className="mt-0.5 text-ds-sm text-muted">
          Mostre a tag de um dos seus servidores ao lado do seu nome, em qualquer lugar. Se o servidor mudar o nome
          da tag, é só escolher de novo aqui.
        </p>
      </div>
      {options.length === 0 ? (
        <p className="text-ds-sm text-muted">Nenhum dos seus servidores tem tag ainda.</p>
      ) : (
        <div role="group" aria-label="Tag do servidor" className="flex flex-col gap-2">
          {options.map((option) => {
            const on = current?.server_id === option.server_id
            return (
              <button
                key={option.server_id}
                type="button"
                aria-pressed={on}
                disabled={busy}
                onClick={() => onChoose(on ? null : option.server_id)}
                className={`${ROW} ${rowState(on)}`}
              >
                <OptionIcon option={option} />
                <span className="min-w-0 flex-1 truncate text-ds-sm font-medium text-strong">{option.server_name}</span>
                <ServerTagPreview tag={option} />
                {on && <CheckIcon size={16} className="shrink-0 text-brand" />}
              </button>
            )
          })}
          <p className="text-ds-xs text-muted">Clique na tag em uso para deixar de usar.</p>
        </div>
      )}
    </section>
  )
}
