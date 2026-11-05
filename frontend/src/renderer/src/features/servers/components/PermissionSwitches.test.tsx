import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import PermissionSwitches, { computeItemState, nextPermissionsValue } from './PermissionSwitches'
import { ALL_PERMISSIONS, Perm, type PermissionGroup } from '../lib/permissions'

const mockGroups: PermissionGroup[] = [
  {
    title: 'Administrador',
    permissions: [
      {
        name: 'ADMINISTRATOR',
        label: 'Administrador',
        description: 'Pode tudo.'
      }
    ]
  },
  {
    title: 'Geral',
    permissions: [
      {
        name: 'VIEW_CHANNEL',
        label: 'Ver canais',
        description: 'Vê canais.'
      },
      {
        name: 'MANAGE_CHANNELS',
        label: 'Gerenciar canais',
        description: 'Gerencia canais.'
      }
    ]
  }
]

describe('PermissionSwitches helpers', () => {
  it('computeItemState quando Administrador está desmarcado', () => {
    // Normal: permitido toggle e desmarcado
    const normalOff = computeItemState(Perm.VIEW_CHANNEL, false, false, 0, () => true)
    expect(normalOff.allowed).toBe(true)
    expect(normalOff.checked).toBe(false)
    expect(normalOff.title).toBeUndefined()

    // Normal: permitido toggle e marcado
    const normalOn = computeItemState(Perm.VIEW_CHANNEL, false, false, Perm.VIEW_CHANNEL, () => true)
    expect(normalOn.allowed).toBe(true)
    expect(normalOn.checked).toBe(true)

    // Sem permissão de toggle
    const notAllowed = computeItemState(Perm.VIEW_CHANNEL, false, false, 0, () => false)
    expect(notAllowed.allowed).toBe(false)
    expect(notAllowed.title).toBe('Você não tem essa permissão para dar a outros.')
  })

  it('computeItemState quando Administrador está ativo', () => {
    // Para permissão comum: sempre marcada e não permitida para edição
    const commonState = computeItemState(Perm.VIEW_CHANNEL, false, true, Perm.ADMINISTRATOR, () => true)
    expect(commonState.allowed).toBe(false)
    expect(commonState.checked).toBe(true)
    expect(commonState.title).toBe('Desabilitado para edição pois Administrador está ativo.')

    // Para o próprio switch Administrador: segue canToggle e fica marcado
    const adminState = computeItemState(Perm.ADMINISTRATOR, true, true, Perm.ADMINISTRATOR, () => true)
    expect(adminState.allowed).toBe(true)
    expect(adminState.checked).toBe(true)
    expect(adminState.title).toBeUndefined()
  })

  it('nextPermissionsValue ao alternar permissão comum', () => {
    const turnedOn = nextPermissionsValue(0, Perm.VIEW_CHANNEL, false, true)
    expect(turnedOn).toBe(Perm.VIEW_CHANNEL)

    const turnedOff = nextPermissionsValue(Perm.VIEW_CHANNEL, Perm.VIEW_CHANNEL, false, false)
    expect(turnedOff).toBe(0)
  })

  it('nextPermissionsValue ao marcar Administrador liga tudo; ao desmarcar desliga apenas Administrador', () => {
    const adminOn = nextPermissionsValue(0, Perm.ADMINISTRATOR, true, true)
    expect(adminOn & Perm.ADMINISTRATOR).toBeTruthy()
    expect(adminOn).toBe(ALL_PERMISSIONS)

    const adminOff = nextPermissionsValue(adminOn, Perm.ADMINISTRATOR, true, false)
    expect(adminOff & Perm.ADMINISTRATOR).toBe(0)
  })
})

describe('PermissionSwitches component', () => {
  it('renderiza o grupo Administrador em cima de Geral', () => {
    const html = renderToStaticMarkup(
      <PermissionSwitches
        value={0}
        onChange={vi.fn()}
        canToggle={() => true}
        groups={mockGroups}
      />
    )
    const adminIdx = html.indexOf('Administrador')
    const generalIdx = html.indexOf('Geral')
    expect(adminIdx).toBeGreaterThan(-1)
    expect(generalIdx).toBeGreaterThan(adminIdx)
  })

  it('quando Administrador está ativo, os itens comuns aparecem desabilitados e com aviso', () => {
    const html = renderToStaticMarkup(
      <PermissionSwitches
        value={Perm.ADMINISTRATOR}
        onChange={vi.fn()}
        canToggle={() => true}
        groups={mockGroups}
      />
    )
    expect(html).toContain('Desabilitado para edição pois Administrador está ativo.')
    expect(html).toContain('opacity-50')
  })

  it('item bloqueado não liga pelo teclado: o switch vem disabled, não só sem clique', () => {
    const html = renderToStaticMarkup(
      <PermissionSwitches value={0} onChange={vi.fn()} canToggle={() => false} groups={mockGroups} />
    )
    expect(html).not.toContain('pointer-events-none')
    expect(html.match(/role="switch"[^>]*disabled=""/g)).toHaveLength(3)
  })
})

describe('nextPermissionsValue com o bit mais alto', () => {
  it('liga e desliga sem sinal (o valor vai ao servidor e é comparado)', () => {
    const on = nextPermissionsValue(Perm.VIEW_CHANNEL, Perm.USE_EXTERNAL_EMOJIS, false, true)
    expect(on).toBe(Perm.VIEW_CHANNEL + 2 ** 31)
    expect(nextPermissionsValue(on, Perm.VIEW_CHANNEL, false, false)).toBe(2 ** 31)
    expect(nextPermissionsValue(on, Perm.USE_EXTERNAL_EMOJIS, false, false)).toBe(Perm.VIEW_CHANNEL)
  })

  it('ligar Administrador liga tudo, sem sinal', () => {
    expect(nextPermissionsValue(0, Perm.ADMINISTRATOR, true, true)).toBe(2 ** 32 - 1)
  })
})
