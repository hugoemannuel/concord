import { describe, expect, it } from 'vitest'
import type { ServerMember } from '../../servers/api/servers'
import { actorOptions } from './auditActors'

describe('filtro por usuário', () => {
  it('usa o apelido no servidor e ordena pelo nome', () => {
    const members = [
      { user_id: 'b', display_name: 'Bruno', username: 'bruno', nickname: null },
      { user_id: 'a', display_name: 'Zé', username: 'ze', nickname: 'Ana' },
      { user_id: 'c', display_name: 'Élio', username: 'elio', nickname: null }
    ] as unknown as ServerMember[]
    expect(actorOptions(members)).toEqual([
      { id: 'a', name: 'Ana' },
      { id: 'b', name: 'Bruno' },
      { id: 'c', name: 'Élio' }
    ])
  })
})
