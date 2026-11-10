import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { CastigoFormState } from '../hooks/useCastigoForm'
import type { CastigoVoteState } from '../hooks/useCastigoVote'
import type { CastigoVote } from '../lib/castigo'

vi.mock('../../../shared/ui/Modal', () => ({
  default: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div data-title={title}>{children}</div>
  )
}))

const form: { current: CastigoFormState } = { current: null as never }
vi.mock('../hooks/useCastigoForm', () => ({ useCastigoForm: () => form.current }))
vi.mock('../hooks/useCastigoNames', () => ({
  useCastigoNames: () => (id: string) => ({ ana: 'Ana', bia: 'Bia' })[id] ?? 'Alguém'
}))

import CastigoModal, { CastigoForm } from './CastigoModal'
import CastigoVoteCard from './CastigoVoteCard'
import CastigoSelfNotice from './CastigoSelfNotice'
import { useCastigoDialogStore } from '../store/castigoDialogStore'

function formState(over: Partial<CastigoFormState> = {}): CastigoFormState {
  return {
    effects: { speak: true, connect: false, listen: false },
    toggle: vi.fn(),
    duration: 300,
    setDuration: vi.fn(),
    busy: false,
    showDirect: false,
    canDirect: false,
    canVote: true,
    applyNow: vi.fn(),
    startVote: vi.fn(),
    ...over
  }
}

const target = {
  serverId: 's',
  userId: 'ana',
  name: 'Ana',
  callId: 'c',
  canMute: false,
  canDeafen: false,
  canDisconnect: false
}
const renderForm = (): string =>
  renderToStaticMarkup(<CastigoForm target={target} onDone={() => {}} />)

describe('CastigoModal', () => {
  it('sem alvo não desenha nada', () => {
    expect(renderToStaticMarkup(<CastigoModal />)).toBe('')
  })

  it('o store guarda e fecha o alvo', () => {
    useCastigoDialogStore.getState().open(target)
    expect(useCastigoDialogStore.getState().target?.name).toBe('Ana')
    useCastigoDialogStore.getState().close()
    expect(useCastigoDialogStore.getState().target).toBeNull()
  })

  it('quem não modera só abre votação, com a dica do cargo', () => {
    form.current = formState()
    const html = renderForm()
    expect(html).toContain('Abrir votação')
    expect(html).not.toContain('Castigar agora')
    expect(html).toContain('é preciso um cargo')
    for (const label of ['Falar', 'Entrar na call', 'Escutar', '1 min', '1 hora'])
      expect(html).toContain(label)
  })

  it('quem modera vê castigar agora; travado se a escolha pede outra permissão', () => {
    form.current = formState({ showDirect: true, canDirect: false, canVote: false })
    const html = renderForm()
    expect(html).toContain('Castigar agora')
    expect(html).not.toContain('Abrir votação')
    expect(html).toContain('Seu cargo não deixa')
  })

  it('sem nenhuma opção marcada pede uma', () => {
    form.current = formState({ effects: { speak: false, connect: false, listen: false } })
    expect(renderForm()).toContain('Escolha pelo menos uma opção.')
  })
})

const vote: CastigoVote = {
  id: 'v',
  call_id: 'c',
  server_id: 's',
  target_id: 'ana',
  initiator_id: 'bia',
  effects: { speak: true, connect: false, listen: true },
  duration: 600,
  voters: ['bia', 'caio', 'duda'],
  yes: ['bia'],
  no: [],
  needed: 2,
  expires_at: new Date(Date.now() + 60_000).toISOString(),
  status: 'open'
}

function voteState(over: Partial<CastigoVoteState> = {}): CastigoVoteState & { vote: CastigoVote } {
  return { vote, ballot: 'can_vote', isTarget: false, busy: false, cast: vi.fn(), ...over } as never
}

describe('CastigoVoteCard', () => {
  it('quem pode votar vê Sim e Não com a contagem', () => {
    const html = renderToStaticMarkup(<CastigoVoteCard state={voteState()} />)
    expect(html).toContain('Castigo para Ana?')
    expect(html).toContain('sem falar e sem escutar · 10 min')
    expect(html).toContain('Votação aberta por Bia')
    expect(html).toContain('1 de 2 votos')
    expect(html).toContain('>Sim<')
    expect(html).toContain('>Não<')
  })

  it('quem já votou, o alvo e quem entrou depois não veem os botões', () => {
    expect(
      renderToStaticMarkup(<CastigoVoteCard state={voteState({ ballot: 'voted_yes' })} />)
    ).toContain('Você votou')
    expect(
      renderToStaticMarkup(
        <CastigoVoteCard state={voteState({ ballot: 'not_voter', isTarget: true })} />
      )
    ).toContain('A votação é sobre você')
    const late = renderToStaticMarkup(
      <CastigoVoteCard state={voteState({ ballot: 'not_voter' })} />
    )
    expect(late).toContain('não vota')
    expect(late).not.toContain('>Sim<')
  })

  it('o resultado', () => {
    const passed = { ...vote, status: 'passed' as const, yes: ['bia', 'caio'] }
    expect(
      renderToStaticMarkup(<CastigoVoteCard state={voteState({ vote: passed } as never)} />)
    ).toContain('Ana ficou de castigo.')
    const failed = { ...vote, status: 'expired' as const }
    expect(
      renderToStaticMarkup(<CastigoVoteCard state={voteState({ vote: failed } as never)} />)
    ).toContain('A votação não passou.')
  })
})

describe('CastigoSelfNotice', () => {
  it('o que vale e quando acaba', () => {
    const html = renderToStaticMarkup(
      <CastigoSelfNotice
        effects={{ speak: false, connect: true, listen: false }}
        endsAt={Date.now() + 60_000}
      />
    )
    expect(html).toContain('Você está de castigo')
    expect(html).toContain('sem entrar na call')
    expect(html).toContain('Termina às')
  })
})
