import { describe, expect, it } from 'vitest'
import {
  PORTAL_PROBES,
  portalMissingMessage,
  portalPackage,
  portalStatus,
  screenFlowArgs,
  screenFlowFromArgv,
  screenShareFlow
} from './screenShareFlow'

// O preload roda em sandbox (sem process.env de confiança): o main decide o
// fluxo e passa por additionalArguments, como o endereço do servidor.
describe('screenFlowArgs / screenFlowFromArgv', () => {
  it('o fluxo decidido no main chega igual ao preload', () => {
    expect(screenFlowFromArgv(['electron', ...screenFlowArgs('portal')])).toBe('portal')
    expect(screenFlowFromArgv(['electron', ...screenFlowArgs('app')])).toBe('app')
  })

  it('sem o argumento (overlay, dev antigo) vale o modal do app', () => {
    expect(screenFlowFromArgv(['electron', '--salinha-server=https://x'])).toBe('app')
  })

  it('valor desconhecido não vira fluxo', () => {
    expect(screenFlowFromArgv(['--salinha-screen-flow=qualquer'])).toBe('app')
  })
})

describe('screenShareFlow', () => {
  const wayland = { XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-1' }

  it('Linux numa sessão Wayland: seletor do portal (xdg-desktop-portal + PipeWire)', () => {
    expect(screenShareFlow('linux', wayland)).toBe('portal')
  })

  it('Wayland vale mesmo com o app no XWayland (o WebRTC decide pela sessão)', () => {
    // --ozone-platform=x11 não muda XDG_SESSION_TYPE/WAYLAND_DISPLAY.
    expect(screenShareFlow('linux', { ...wayland, DISPLAY: ':1' })).toBe('portal')
  })

  it('Linux no X11: modal do app com as miniaturas', () => {
    expect(screenShareFlow('linux', { XDG_SESSION_TYPE: 'x11', DISPLAY: ':0' })).toBe('app')
  })

  it('sessão "wayland" sem WAYLAND_DISPLAY (ex.: ssh, tty) não usa o portal', () => {
    expect(screenShareFlow('linux', { XDG_SESSION_TYPE: 'wayland' })).toBe('app')
    expect(screenShareFlow('linux', { WAYLAND_DISPLAY: 'wayland-0' })).toBe('app')
  })

  it('Windows e macOS: sempre o modal do app', () => {
    expect(screenShareFlow('win32', wayland)).toBe('app')
    expect(screenShareFlow('darwin', wayland)).toBe('app')
  })
})

describe('portalStatus', () => {
  it('o primeiro programa que existe decide', () => {
    expect(portalStatus(['no-tool', 'ok'])).toBe('available')
    expect(portalStatus(['failed', 'ok'])).toBe('missing')
    expect(portalStatus(['no-tool', 'no-tool', 'failed'])).toBe('missing')
  })

  it('sem como perguntar (nenhum programa) ou sem resposta a tempo: não bloqueia', () => {
    expect(portalStatus(['no-tool', 'no-tool', 'no-tool'])).toBe('unknown')
    expect(portalStatus(['timeout'])).toBe('unknown')
    expect(portalStatus([])).toBe('unknown')
  })

  it('pergunta a versão da interface ScreenCast do portal, em todas as ferramentas', () => {
    expect(PORTAL_PROBES.map((p) => p.cmd)).toEqual(['gdbus', 'busctl', 'dbus-send'])
    for (const probe of PORTAL_PROBES) {
      expect(probe.args.join(' ')).toContain('org.freedesktop.portal.ScreenCast')
      expect(probe.args.join(' ')).toContain('/org/freedesktop/portal/desktop')
    }
  })
})

describe('portalPackage', () => {
  it('pacote do portal de cada ambiente', () => {
    expect(portalPackage('Hyprland')).toBe('xdg-desktop-portal-hyprland')
    expect(portalPackage('GNOME')).toBe('xdg-desktop-portal-gnome')
    expect(portalPackage('ubuntu:GNOME')).toBe('xdg-desktop-portal-gnome')
    expect(portalPackage('KDE')).toBe('xdg-desktop-portal-kde')
    expect(portalPackage('sway')).toBe('xdg-desktop-portal-wlr')
    expect(portalPackage('niri')).toBe('xdg-desktop-portal-gnome')
    expect(portalPackage('COSMIC')).toBe('xdg-desktop-portal-cosmic')
  })

  it('ambiente desconhecido: sem pacote específico', () => {
    expect(portalPackage('')).toBeNull()
    expect(portalPackage(undefined)).toBeNull()
    expect(portalPackage('labwc-xyz')).toBeNull()
  })
})

describe('portalMissingMessage', () => {
  it('Hyprland: diz o pacote e como instalar nas distros comuns', () => {
    const msg = portalMissingMessage('Hyprland')
    expect(msg).toContain(
      'Instale o xdg-desktop-portal-hyprland (ou o portal do seu ambiente) para compartilhar a tela'
    )
    expect(msg).toContain('sudo pacman -S xdg-desktop-portal-hyprland')
    expect(msg).toContain('sudo apt install xdg-desktop-portal-hyprland')
    expect(msg).toContain('sudo dnf install xdg-desktop-portal-hyprland')
  })

  it('ambiente desconhecido: mensagem genérica, sem comando de instalação', () => {
    const msg = portalMissingMessage(undefined)
    expect(msg).toContain('Instale o xdg-desktop-portal e o portal do seu ambiente')
    expect(msg).not.toContain('sudo')
  })
})
