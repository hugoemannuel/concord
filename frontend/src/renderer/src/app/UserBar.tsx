import { useCallback, useState } from 'react'
import { useAuthStore } from '../features/auth/store/authStore'
import { useCallStore } from '../features/call/store/callStore'
import { profileCardHandler } from '../features/profile/store/profileCardStore'
import { useSettingsStore } from '../features/settings/store/settingsStore'
import { STATUS_META } from '../features/friends/lib/presenceStatus'
import Avatar from '../shared/ui/Avatar'
import { useActivity } from '../features/activity/store/presenceActivityStore'
import AudioDeviceMenu, { type AudioDeviceKind } from '../features/call/components/AudioDeviceMenu'
import { openOnContextMenu } from '../features/call/lib/anchorMenu'
import { showVoicePanel, userBarSpeaking, userBarSubtitle } from '../features/call/lib/voicePanel'
import {
  ChevronDownIcon,
  GearIcon,
  HeadsetIcon,
  HeadsetOffIcon,
  MicIcon,
  MicOffIcon
} from '../shared/ui/icons'
import StyledName from '../features/profile/components/StyledName'

/** Fundo do painel do usuário (também o recorte do status no avatar). */
const BAR_BG = 'var(--bg-surface)'

/**
 * Microfone ou fone com a setinha do lado (como no Discord): o botão liga e
 * desliga; a setinha ou o clique direito abrem o menu do dispositivo e do volume. Vermelho quando desligado.
 * Com a sidebar no mínimo a setinha some (o menu segue em Configurações → Voz).
 */
function AudioToggle({
  kind,
  off,
  dimmed = false,
  label,
  title,
  onToggle,
  menuOpen,
  onMenu,
  children
}: {
  kind: AudioDeviceKind
  off: boolean
  dimmed?: boolean
  label: string
  title: string
  onToggle: () => void
  menuOpen: boolean
  onMenu: (anchor: HTMLElement) => void
  children: React.ReactNode
}): React.JSX.Element {
  const tone = off
    ? 'bg-danger/15 text-danger hover:bg-danger/25'
    : 'text-gray-300 hover:bg-fg/10 hover:text-strong'
  const menuLabel = kind === 'input' ? 'Opções de entrada' : 'Opções de saída'
  return (
    <div className="flex shrink-0 items-center">
      <button
        type="button"
        onClick={onToggle}
        onContextMenu={openOnContextMenu(onMenu)}
        aria-label={label}
        title={title}
        className={`flex h-8 w-7 cursor-pointer items-center justify-center rounded-l-md transition-colors @max-[239px]:rounded-md ${tone} ${
          dimmed ? 'opacity-50' : ''
        }`}
      >
        {children}
      </button>
      <button
        type="button"
        onClick={(e) => onMenu(e.currentTarget)}
        aria-label={menuLabel}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title={menuLabel}
        className={`flex h-8 w-4 cursor-pointer items-center justify-center rounded-r-md transition-colors @max-[239px]:hidden ${
          menuOpen ? 'bg-fg/15 text-strong' : tone
        }`}
      >
        <ChevronDownIcon className="h-3 w-3" />
      </button>
    </div>
  )
}

/**
 * Barra de baixo (como no Discord): clicar na foto ou no nome abre o próprio
 * cartão de perfil (de lá, Editar perfil e Status); na chamada, microfone e
 * fone com o menu de dispositivo; a engrenagem abre as Configurações.
 */
function UserBar(): React.JSX.Element {
  const user = useAuthStore((s) => s.user)
  const openSettings = useSettingsStore((s) => s.openSettings)
  const inCall = useCallStore((s) => showVoicePanel(s.status))
  const muted = useCallStore((s) => s.muted)
  const deafened = useCallStore((s) => s.deafened)
  const canSpeak = useCallStore((s) => s.canSpeak)
  const toggleMute = useCallStore((s) => s.toggleMute)
  const toggleDeafen = useCallStore((s) => s.toggleDeafen)
  // Mesmo anel verde da lista de voz e dos tiles da chamada enquanto eu falo.
  const speaking = useCallStore((s) =>
    userBarSpeaking({
      inCall: showVoicePanel(s.status),
      muted: s.muted,
      userId: user?.id,
      speakingIds: s.speakingIds
    })
  )

  /** Menu de dispositivo aberto e a setinha em que ele fica (null = fechado). */
  const [menu, setMenu] = useState<{ kind: AudioDeviceKind; anchor: HTMLElement } | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const toggleMenu = (kind: AudioDeviceKind) => (anchor: HTMLElement) =>
    setMenu((open) => (open?.kind === kind ? null : { kind, anchor }))

  const status = user?.status ?? 'online'
  const name = user?.display_name || user?.username || ''
  const game = useActivity(user?.id)
  const subtitle = userBarSubtitle({
    game: game?.name,
    inCall,
    note: user?.status_text,
    statusLabel: STATUS_META[status].label
  })

  const micLabel = muted ? 'Ativar Microfone' : 'Silenciar Microfone'
  const deafenLabel = deafened ? 'Ativar Audio' : 'Silenciar Audio'

  return (
    <div
      className="flex shrink-0 items-center gap-1 border-t border-subtle px-2 py-1.5 @max-[239px]:gap-0"
      style={{ background: BAR_BG }}
    >
      <button
        type="button"
        onClick={user ? profileCardHandler(user.id, name, user.username, 'top') : undefined}
        aria-label="Abrir meu perfil"
        className="group flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md p-1 text-left transition-colors hover:bg-fg/5"
      >
        <Avatar
          userId={user?.id}
          name={name}
          avatarUrl={user?.avatar_url}
          decorationUrl={user?.avatar_decoration_url}
          size={32}
          animate="always"
          status={status}
          cutoutColor={BAR_BG}
          speaking={speaking}
          className={`rounded-full transition-shadow ${speaking ? 'ring-2 ring-success' : ''}`}
        />
        <div className="min-w-0">
          <p className="truncate text-ds-md leading-[18px] font-medium text-strong">
            <StyledName name={name} userId={user?.id} style={user?.name_style} />
          </p>
          {/* Como no Discord: "Em call", a nota (ou o status) e, com o mouse, o @. */}
          <p
            className={`truncate text-ds-xs leading-[13px] font-medium group-hover:hidden ${
              inCall && !game ? 'text-success' : 'text-gray-400'
            }`}
          >
            {subtitle}
          </p>
          <p className="hidden truncate text-ds-xs leading-[13px] font-medium text-gray-400 group-hover:block">
            @{user?.username}
          </p>
        </div>
      </button>

      {inCall && (
        <>
          <AudioToggle
            kind="input"
            off={muted}
            dimmed={!canSpeak}
            label={micLabel}
            title={canSpeak ? micLabel : 'Você não pode falar neste canal'}
            onToggle={toggleMute}
            menuOpen={menu?.kind === 'input'}
            onMenu={toggleMenu('input')}
          >
            {muted ? (
              <MicOffIcon className="h-[18px] w-[18px]" />
            ) : (
              <MicIcon className="h-[18px] w-[18px]" />
            )}
          </AudioToggle>
          <AudioToggle
            kind="output"
            off={deafened}
            label={deafenLabel}
            title={deafenLabel}
            onToggle={toggleDeafen}
            menuOpen={menu?.kind === 'output'}
            onMenu={toggleMenu('output')}
          >
            {deafened ? (
              <HeadsetOffIcon className="h-[18px] w-[18px]" />
            ) : (
              <HeadsetIcon className="h-[18px] w-[18px]" />
            )}
          </AudioToggle>
        </>
      )}

      <button
        type="button"
        onClick={() => openSettings('account')}
        aria-label="Configurações do usuário"
        title="Configurações do usuário"
        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-fg/10 hover:text-strong"
      >
        <GearIcon className="h-[18px] w-[18px]" />
      </button>

      {menu && inCall && (
        <AudioDeviceMenu kind={menu.kind} anchor={menu.anchor} onClose={closeMenu} />
      )}
    </div>
  )
}

export default UserBar
