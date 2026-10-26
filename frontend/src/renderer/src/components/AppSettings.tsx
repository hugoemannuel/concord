import { useEffect, useState } from 'react'
import type { NotificationPrefs } from '../lib/notifications'
import { OVERLAY_OPACITY_MAX, OVERLAY_OPACITY_MIN, OVERLAY_OPACITY_STEP } from '../lib/overlayState'
import { getBirthday, setBirthday, type Birthday } from '../api/birthdays'
import { birthdayError } from '../lib/birthday'
import { showToast } from '../store/toastStore'
import BirthdayFields from './BirthdayFields'
import { useNotificationPrefsStore } from '../store/notificationPrefsStore'
import { useOverlayPrefsStore } from '../store/overlayPrefsStore'
import OverlayShortcutField from './OverlayShortcutField'
import { IS_WEB } from '../lib/config'
import { permissionView, type WebPermission } from '../lib/webNotifications'
import { browserPermission, requestBrowserPermission } from '../lib/browserNotifications'
import LevelUpPreview from './level/LevelUpPreview'
import Switch from './Switch'
import MutedNotifications from './MutedNotifications'
import ServerSettings from './settings/ServerSettings'

/** Linha com título, descrição e o interruptor, como nas configurações do Discord. */
export function Toggle({
  title,
  description,
  checked,
  onChange
}: {
  title: string
  description: string
  checked: boolean
  onChange: () => void
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-ds-md font-medium text-white">{title}</span>
        <span className="block text-ds-sm text-gray-400">{description}</span>
      </span>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  )
}

type NotificationOption = { key: keyof NotificationPrefs; title: string; description: string }

const SOUND_OPTION: NotificationOption = {
  key: 'sound',
  title: 'Som de notificação',
  description: 'Toca um som ao receber uma DM ou ser mencionado.'
}

const NOTIFICATION_OPTIONS: NotificationOption[] = IS_WEB
  ? [
      {
        key: 'taskbar',
        title: 'Mostrar no título da aba',
        description: 'Mostra quantas mensagens chegaram enquanto você não olhava, ex.: (3) Salinha.'
      },
      {
        key: 'desktop',
        title: 'Notificações do navegador',
        description: 'Mostra um aviso do navegador com a mensagem recebida.'
      },
      SOUND_OPTION
    ]
  : [
      {
        key: 'taskbar',
        title: 'Mostrar na barra de tarefas',
        description: 'Pisca a Salinha e mostra quantas mensagens chegaram enquanto você não olhava.'
      },
      {
        key: 'desktop',
        title: 'Notificações na área de trabalho',
        description: 'Mostra um aviso do Windows com a mensagem recebida.'
      },
      SOUND_OPTION
    ]

/** Permissão do navegador para os avisos (só no build web). */
function BrowserPermission(): React.JSX.Element {
  const [permission, setPermission] = useState<WebPermission>(browserPermission)
  const view = permissionView(permission)

  // Mudou nas permissões do site (cadeado da barra de endereço): acompanha.
  useEffect(() => {
    let status: PermissionStatus | undefined
    const update = (): void => setPermission(browserPermission())
    navigator.permissions
      ?.query({ name: 'notifications' })
      .then((result) => {
        status = result
        status.addEventListener('change', update)
      })
      .catch(() => {})
    return () => status?.removeEventListener('change', update)
  }, [])

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-black/20 px-3 py-2">
      <span className="text-xs text-gray-400">{view.status}</span>
      {view.canRequest && (
        <button
          type="button"
          onClick={() => void requestBrowserPermission().then(setPermission)}
          className="shrink-0 cursor-pointer rounded-md bg-[#23a55a] px-3 py-1.5 text-ds-sm font-medium text-white transition-colors hover:bg-[#1f9450]"
        >
          Permitir notificações
        </button>
      )}
    </div>
  )
}

/** Aniversário (opcional) e se os servidores podem anunciar. Salva na hora. */
export function BirthdaySettings(): React.JSX.Element {
  const [birthday, setLocal] = useState<Birthday | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getBirthday()
      .then(setLocal)
      .catch(() => setLocal({ day: null, month: null, year: null, announce: true }))
  }, [])

  const save = async (next: Birthday): Promise<void> => {
    setLocal(next)
    // Só salva quando dá: os dois vazios ou dia e mês escolhidos.
    if (birthdayError(next)) return
    setSaving(true)
    try {
      setLocal(await setBirthday(next))
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : 'Não foi possível salvar o aniversário.')
    } finally {
      setSaving(false)
    }
  }

  if (!birthday) return <div className="rounded-xl border border-white/10 bg-white/5 p-4" />

  const error = birthdayError(birthday)

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h3 className="mb-3 text-ds-sm font-medium text-gray-400">Aniversário</h3>
      <div className="flex flex-col gap-3">
        <BirthdayFields
          value={birthday}
          onChange={(value) => void save({ ...birthday, ...value })}
        />
        {error && <p className="text-xs text-amber-300">{error}</p>}
        <p className="text-ds-xs text-gray-500">
          Sua idade aparece só para você, no recado de feliz aniversário.
        </p>
        <Toggle
          title="Anunciar meu aniversário nos servidores"
          description="No seu dia, os servidores mandam uma mensagem de parabéns no canal principal e você vê um recado ao abrir o app."
          checked={birthday.announce}
          onChange={() => void save({ ...birthday, announce: !birthday.announce })}
        />
        {saving && <p className="text-ds-xs text-gray-500">Salvando…</p>}
      </div>
    </div>
  )
}

/** Configurações → Notificações. */
export function NotificationSettings(): React.JSX.Element {
  const prefs = useNotificationPrefsStore()
  return (
    <>
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-col gap-4">
          {IS_WEB && <BrowserPermission />}
          {NOTIFICATION_OPTIONS.map((option) => (
            <Toggle
              key={option.key}
              title={option.title}
              description={option.description}
              checked={prefs[option.key]}
              onChange={() => prefs.setPref(option.key, !prefs[option.key])}
            />
          ))}
        </div>
      </div>
      <MutedNotifications />
    </>
  )
}

/**
 * Configurações → Aplicativo: iniciar com o sistema e overlay (só onde há
 * suporte, ex.: Windows).
 */
export function DesktopSettings(): React.JSX.Element {
  const background = window.api?.background
  // undefined = ainda carregando; null = não suportado nesta plataforma
  const [autostart, setAutostart] = useState<boolean | null | undefined>(undefined)
  const overlayEnabled = useOverlayPrefsStore((s) => s.enabled)
  const setOverlayEnabled = useOverlayPrefsStore((s) => s.setEnabled)
  const overlayOpacity = useOverlayPrefsStore((s) => s.opacity)
  const setOverlayOpacity = useOverlayPrefsStore((s) => s.setOpacity)
  const overlayMoved = useOverlayPrefsStore(
    (s) => s.layout.position !== null || s.layout.scale !== 1
  )
  const resetOverlayLayout = useOverlayPrefsStore((s) => s.resetLayout)

  useEffect(() => {
    void background?.getAutostart().then(setAutostart)
  }, [background])

  const toggleAutostart = (): void => {
    void background?.setAutostart(!autostart).then((value) => {
      if (value !== null) setAutostart(value)
    })
  }

  const hasAutostart = Boolean(background) && typeof autostart === 'boolean'
  const hasOverlay = Boolean(background && window.api?.overlay?.supported)

  return (
    <div className="flex flex-col gap-4">
      <ServerSettings />
      {hasAutostart && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <Toggle
            title="Iniciar com o Windows"
            description="Abre escondido na bandeja, pronto para receber chamadas."
            checked={Boolean(autostart)}
            onChange={toggleAutostart}
          />
        </div>
      )}
      {/* Overlay de jogo: só Windows (preload: process.platform, sandbox desligado). */}
      {hasOverlay && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h3 className="mb-3 text-ds-sm font-medium text-gray-400">Overlay</h3>
          <Toggle
            title="Overlay nos jogos"
            description="Mostra quem está na chamada e quem está falando por cima de jogos em tela cheia (modo janela)."
            checked={overlayEnabled}
            onChange={() => setOverlayEnabled(!overlayEnabled)}
          />
          <OverlayShortcutField disabled={!overlayEnabled} />
          <div className="mt-4 flex items-center justify-between gap-3">
            <span>
              <span className="block text-ds-md font-medium text-white">Posição e tamanho</span>
              <span className="block text-ds-sm text-gray-400">
                Volta para a esquerda, no meio da tela, no tamanho normal.
              </span>
            </span>
            <button
              type="button"
              onClick={resetOverlayLayout}
              disabled={!overlayMoved}
              className="shrink-0 cursor-pointer rounded-lg bg-white/10 px-3 py-2 text-ds-sm font-medium text-white transition-colors hover:bg-white/15 disabled:cursor-default disabled:opacity-50"
            >
              Restaurar posição
            </button>
          </div>
          <label className="mt-4 flex flex-col gap-2">
            <span className="flex items-center justify-between text-ds-md font-medium text-white">
              Opacidade do overlay (quem fala fica mais visível)
              <span className="text-xs font-medium text-gray-400">{overlayOpacity}%</span>
            </span>
            <input
              type="range"
              min={OVERLAY_OPACITY_MIN}
              max={OVERLAY_OPACITY_MAX}
              step={OVERLAY_OPACITY_STEP}
              value={overlayOpacity}
              disabled={!overlayEnabled}
              onChange={(e) => setOverlayOpacity(Number(e.target.value))}
              aria-label="Opacidade do overlay"
              className="accent-[#5865f2] disabled:opacity-40"
            />
            <span className="text-xs text-gray-400">
              Bem fraquinho em repouso para não atrapalhar o jogo; quem está falando aparece mais
              forte.
            </span>
          </label>
        </div>
      )}
      {!hasAutostart && !hasOverlay && !window.api?.server?.url && (
        <p className="text-ds-md text-gray-400">Nada para configurar aqui nesta plataforma.</p>
      )}
      {/* Prévia da animação de nível: só no build de dev (some do build final). */}
      {import.meta.env.DEV && <LevelUpPreview />}
    </div>
  )
}
