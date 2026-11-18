import { beforeEach, describe, expect, it, vi } from 'vitest'

const channel = { name: 'Geral' as string | null }
vi.mock('../../call/hooks/useCallChannelName', () => ({ useCallChannelName: () => channel.name }))
vi.mock('../../profile/store/profileStore', () => ({
  useUserLook: (_id: string, fallback: { name: string }) => ({ name: fallback.name })
}))
vi.mock('../../profile/components/StyledName', () => ({
  default: ({ name }: { name: string }) => <b>{name}</b>
}))
vi.mock('../../../shared/ui/Avatar', () => ({ default: () => <u data-avatar /> }))

import { renderToStaticMarkup } from 'react-dom/server'
import type { PublicUser } from '../../auth/store/authStore'
import type { FriendInVoice } from '../lib/onlineFriends'
import ActiveVoiceFriendCard from './ActiveVoiceFriendCard'

const ana = { id: 'a', username: 'ana', display_name: 'Ana' } as PublicUser
const people = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, avatarUrl: null }))

function render(n = 4): string {
  const item: FriendInVoice = { friend: ana, serverId: 's1', channelId: 'ch1', people: people(n) }
  return renderToStaticMarkup(
    <ActiveVoiceFriendCard item={item} serverName="Os Brabos" onJoin={() => {}} />
  )
}

describe('ActiveVoiceFriendCard', () => {
  beforeEach(() => {
    channel.name = 'Geral'
  })

  it('mostra servidor, canal e quantos estão na call', () => {
    const html = render()
    expect(html).toContain('Os Brabos · Geral')
    expect(html).toContain('4 na call')
  })

  it('é um botão com rótulo para leitor de tela', () => {
    const html = render()
    expect(html).toContain('type="button"')
    expect(html).toContain('aria-label="Entrar na call de Ana em Geral"')
    expect(html).toContain('focus-ring')
  })

  it('sem nome do canal ainda, mostra Canal de voz', () => {
    channel.name = null
    expect(render()).toContain('Os Brabos · Canal de voz')
  })

  it('mais de 5 pessoas mostra +N', () => {
    expect(render(7)).toContain('+2')
  })

  it('o clique chama a ação com servidor e canal', () => {
    const onJoin = vi.fn()
    const item: FriendInVoice = { friend: ana, serverId: 's1', channelId: 'ch1', people: people(2) }
    // Os hooks do card estão mockados: dá para chamar o componente e pegar o <button>.
    const button = ActiveVoiceFriendCard({ item, serverName: 'Os Brabos', onJoin })
    button.props.onClick()
    expect(onJoin).toHaveBeenCalledWith({ serverId: 's1', channelId: 'ch1' })
  })
})
