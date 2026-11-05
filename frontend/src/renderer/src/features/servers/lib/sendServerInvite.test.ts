import { describe, expect, it, vi } from 'vitest'
import { sendServerInvite, type SendInviteDeps } from './sendServerInvite'

function deps(over: Partial<SendInviteDeps> = {}): SendInviteDeps {
  return {
    getCode: vi.fn().mockResolvedValue('ABCD1234'),
    openDM: vi.fn().mockResolvedValue({ id: 'conv1' }),
    send: vi.fn().mockResolvedValue({}),
    link: (code) => `https://app/convite/${code}`,
    ...over
  }
}

describe('sendServerInvite', () => {
  it('manda o link do convite na DM com o amigo', async () => {
    const d = deps()
    await sendServerInvite('s1', 'bia', d)
    expect(d.getCode).toHaveBeenCalledWith('s1')
    expect(d.openDM).toHaveBeenCalledWith('bia')
    expect(d.send).toHaveBeenCalledWith('conv1', 'https://app/convite/ABCD1234')
  })

  it('sem código (sem permissão), não abre DM e repassa o erro', async () => {
    const d = deps({ getCode: vi.fn().mockRejectedValue(new Error('sem permissão')) })
    await expect(sendServerInvite('s1', 'bia', d)).rejects.toThrow('sem permissão')
    expect(d.openDM).not.toHaveBeenCalled()
    expect(d.send).not.toHaveBeenCalled()
  })

  it('DM não abre (bloqueio), não manda nada', async () => {
    const d = deps({ openDM: vi.fn().mockRejectedValue(new Error('bloqueado')) })
    await expect(sendServerInvite('s1', 'bia', d)).rejects.toThrow('bloqueado')
    expect(d.send).not.toHaveBeenCalled()
  })
})
