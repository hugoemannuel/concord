// Como o compartilhamento de tela escolhe a fonte em cada plataforma. Puro
// para poder testar (o main decide; o preload só lê o argumento).
//
// Wayland não deixa um app listar telas/janelas: o Chromium pede ao
// xdg-desktop-portal (interface ScreenCast), que abre o seletor do sistema e
// entrega a imagem pelo PipeWire. No Electron, cada desktopCapturer.getSources
// abre esse seletor de novo e devolve UMA fonte com id novo — o modal do app
// (que lista e depois procura a fonte pelo id) nunca acha a escolhida.

/** 'app' = modal do app com miniaturas; 'portal' = seletor do sistema. */
export type ScreenShareFlow = 'app' | 'portal'

type Env = Record<string, string | undefined>

/**
 * Mesma regra do WebRTC do Chromium (IsRunningUnderWayland): sessão Wayland
 * com WAYLAND_DISPLAY. Vale também com o app no XWayland
 * (--ozone-platform=x11), que continua capturando pelo portal.
 */
export function screenShareFlow(platform: string, env: Env): ScreenShareFlow {
  if (platform !== 'linux') return 'app'
  const wayland = (env.XDG_SESSION_TYPE ?? '').startsWith('wayland') && !!env.WAYLAND_DISPLAY
  return wayland ? 'portal' : 'app'
}

const FLOW_ARG = '--salinha-screen-flow='

/** Argumento da janela principal com o fluxo decidido no main (additionalArguments). */
export function screenFlowArgs(flow: ScreenShareFlow): string[] {
  return [`${FLOW_ARG}${flow}`]
}

/** Lido no preload (em sandbox, sem process.env): sem o argumento, o modal do app. */
export function screenFlowFromArgv(argv: readonly string[]): ScreenShareFlow {
  return argv.includes(`${FLOW_ARG}portal`) ? 'portal' : 'app'
}

const PORTAL_DEST = 'org.freedesktop.portal.Desktop'
const PORTAL_PATH = '/org/freedesktop/portal/desktop'
const SCREENCAST = 'org.freedesktop.portal.ScreenCast'

/**
 * Pergunta ao portal a versão da interface ScreenCast: só existe se algum
 * backend (hyprland, gnome, kde, wlr…) a implementa. Tenta a ferramenta que a
 * distro tiver (glib, systemd ou dbus).
 */
export const PORTAL_PROBES: ReadonlyArray<{ cmd: string; args: string[] }> = [
  {
    cmd: 'gdbus',
    args: [
      'call',
      '--session',
      '--dest',
      PORTAL_DEST,
      '--object-path',
      PORTAL_PATH,
      '--method',
      'org.freedesktop.DBus.Properties.Get',
      SCREENCAST,
      'version'
    ]
  },
  {
    cmd: 'busctl',
    args: ['--user', 'get-property', PORTAL_DEST, PORTAL_PATH, SCREENCAST, 'version']
  },
  {
    cmd: 'dbus-send',
    args: [
      '--session',
      '--print-reply',
      `--dest=${PORTAL_DEST}`,
      PORTAL_PATH,
      'org.freedesktop.DBus.Properties.Get',
      `string:${SCREENCAST}`,
      'string:version'
    ]
  }
]

/** Resultado de cada ferramenta: respondeu, deu erro, não instalada, travou. */
export type ProbeOutcome = 'ok' | 'failed' | 'no-tool' | 'timeout'
export type PortalStatus = 'available' | 'missing' | 'unknown'

/** A primeira ferramenta instalada decide. Sem resposta clara, não bloqueia. */
export function portalStatus(outcomes: ProbeOutcome[]): PortalStatus {
  const answer = outcomes.find((o) => o !== 'no-tool')
  if (answer === 'ok') return 'available'
  if (answer === 'failed') return 'missing'
  return 'unknown'
}

const PORTAL_BY_DESKTOP: Record<string, string> = {
  hyprland: 'xdg-desktop-portal-hyprland',
  gnome: 'xdg-desktop-portal-gnome',
  niri: 'xdg-desktop-portal-gnome',
  kde: 'xdg-desktop-portal-kde',
  plasma: 'xdg-desktop-portal-kde',
  cosmic: 'xdg-desktop-portal-cosmic',
  sway: 'xdg-desktop-portal-wlr',
  river: 'xdg-desktop-portal-wlr',
  wayfire: 'xdg-desktop-portal-wlr',
  labwc: 'xdg-desktop-portal-wlr',
  dwl: 'xdg-desktop-portal-wlr',
  wlroots: 'xdg-desktop-portal-wlr'
}

/** Pacote do portal do ambiente (XDG_CURRENT_DESKTOP, ex.: "ubuntu:GNOME"). */
export function portalPackage(currentDesktop: string | undefined): string | null {
  for (const name of (currentDesktop ?? '').toLowerCase().split(':')) {
    const pkg = PORTAL_BY_DESKTOP[name.trim()]
    if (pkg) return pkg
  }
  return null
}

/** Aviso para quem está sem o portal de captura de tela. */
export function portalMissingMessage(currentDesktop: string | undefined): string {
  const pkg = portalPackage(currentDesktop)
  const restart = 'Depois, saia e entre de novo na sessão.'
  if (!pkg) {
    return `Instale o xdg-desktop-portal e o portal do seu ambiente (com o PipeWire) para compartilhar a tela. ${restart}`
  }
  return (
    `Instale o ${pkg} (ou o portal do seu ambiente) para compartilhar a tela. ` +
    `Arch: sudo pacman -S ${pkg} · Ubuntu/Debian: sudo apt install ${pkg} · ` +
    `Fedora: sudo dnf install ${pkg}. ${restart}`
  )
}
