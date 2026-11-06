import { useState } from 'react'
import {
  DEFAULT_NOTIFY_SETTINGS,
  isMutedNow,
  MUTE_DURATIONS,
  muteUntil,
  type NotificationLevel,
  type NotifySettings
} from '../lib/notificationMute'
import { saveNotifySettings } from '../lib/notifySave'
import { useNotifySettingsStore } from '../store/notifySettingsStore'
import { showToast } from '../../../shared/store/toastStore'
import Modal from '../../../shared/ui/Modal'
import Switch from '../../../shared/ui/Switch'
import { useNow } from '../../../shared/hooks/useNow'

const LEVELS: { value: NotificationLevel; label: string }[] = [
  { value: 'all', label: 'Todas as mensagens' },
  { value: 'mentions', label: 'Só @menções' },
  { value: 'nothing', label: 'Nada' }
]

/** Quando o mute acaba, em texto curto ("até 14:30" / "até reativar"). */
function muteLabel(s: NotifySettings): string {
  if (!s.muted_until) return 'Silenciado até você reativar.'
  const until = new Date(s.muted_until)
  const time = until.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const sameDay = until.toDateString() === new Date().toDateString()
  return `Silenciado até ${sameDay ? time : `${until.toLocaleDateString('pt-BR')} ${time}`}.`
}

function Form({
  serverId,
  channelId
}: {
  serverId: string
  channelId?: string
}): React.JSX.Element {
  const stored = useNotifySettingsStore((s) =>
    channelId ? s.channels[channelId] : s.servers[serverId]
  )
  const saveServer = useNotifySettingsStore((s) => s.saveServer)
  const saveChannel = useNotifySettingsStore((s) => s.saveChannel)
  const [saving, setSaving] = useState(false)

  const current = stored ?? DEFAULT_NOTIFY_SETTINGS
  const muted = isMutedNow(current, useNow())
  const isServer = !channelId

  const save = async (next: NotifySettings): Promise<void> => {
    setSaving(true)
    try {
      const deps = { saveServer, saveChannel, error: showToast.error }
      await saveNotifySettings(deps, serverId, channelId, next)
    } finally {
      setSaving(false)
    }
  }

  const mute = (ms: number | null): void => {
    void save({
      ...current,
      muted: true,
      muted_until: muteUntil(ms)
    })
  }

  const unmute = (): void => {
    void save({ ...current, muted: false, muted_until: null })
  }

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h3 className="mb-2 text-ds-sm font-semibold text-strong">
          {isServer ? 'Silenciar servidor' : 'Silenciar canal'}
        </h3>
        {muted ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-fg/5 p-3">
            <span className="text-ds-sm text-gray-300">{muteLabel(current)}</span>
            <button
              type="button"
              disabled={saving}
              onClick={unmute}
              className="shrink-0 cursor-pointer rounded-md bg-fg/10 px-3 py-1.5 text-ds-sm font-medium text-strong hover:bg-fg/20 disabled:opacity-50"
            >
              Reativar
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {MUTE_DURATIONS.map((d) => (
              <button
                key={d.label}
                type="button"
                disabled={saving}
                onClick={() => mute(d.ms)}
                className="cursor-pointer rounded-md bg-fg/10 px-3 py-1.5 text-ds-sm font-medium text-gray-200 hover:bg-fg/20 disabled:opacity-50"
              >
                {d.label}
              </button>
            ))}
          </div>
        )}
        <p className="mt-2 text-ds-xs text-gray-500">
          Silenciado, não avisa nem conta como não lido; só uma @menção direta a você aparece como
          selo.
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-ds-sm font-semibold text-strong">Avisos</h3>
        <div role="radiogroup" className="flex flex-col gap-1">
          {LEVELS.map((l) => (
            <button
              key={l.value}
              type="button"
              role="radio"
              aria-checked={current.level === l.value}
              disabled={saving}
              onClick={() => void save({ ...current, level: l.value })}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left text-ds-sm text-gray-200 hover:bg-fg/10 disabled:opacity-50"
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  current.level === l.value ? 'border-brand' : 'border-strong'
                }`}
              >
                {current.level === l.value && <span className="h-2 w-2 rounded-full bg-brand" />}
              </span>
              {l.label}
            </button>
          ))}
        </div>
        {!isServer && (
          <p className="mt-1 text-ds-xs text-gray-500">
            &quot;Todas as mensagens&quot; usa a opção do servidor.
          </p>
        )}
      </section>

      {isServer && (
        <section className="flex items-center justify-between gap-4">
          <div>
            <div className="text-ds-sm font-semibold text-strong">Ignorar @all e @here</div>
            <div className="text-ds-xs text-gray-500">
              Menções em massa não avisam nem viram selo.
            </div>
          </div>
          <Switch
            label="Ignorar @all e @here"
            checked={current.suppress_everyone}
            onChange={(v) => void save({ ...current, suppress_everyone: v })}
          />
        </section>
      )}
    </div>
  )
}

/** Silenciar e nível de aviso de um servidor ou canal (aberto pelos menus). */
export default function NotifySettingsModal(): React.JSX.Element | null {
  const target = useNotifySettingsStore((s) => s.modal)
  const close = useNotifySettingsStore((s) => s.closeModal)
  if (!target) return null
  return (
    <Modal
      open
      onClose={close}
      title={`Notificações — ${target.channelId ? '#' : ''}${target.name}`}
    >
      <Form
        key={target.channelId ?? target.serverId}
        serverId={target.serverId}
        channelId={target.channelId}
      />
    </Modal>
  )
}
