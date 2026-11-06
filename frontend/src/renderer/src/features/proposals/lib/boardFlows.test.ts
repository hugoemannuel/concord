import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../shared/api/client'
import type { Proposal } from '../api/proposals'
import {
  findProposal,
  hasMentionFor,
  pendingTarget,
  routeDrop,
  routeMove,
  runBoardAction,
  setStatusOrAskTakeover,
  shouldDropSelection,
  showRejectZone
} from './boardFlows'

const card = (over: Partial<Proposal> = {}): Proposal =>
  ({ id: 'p1', status: 'proposed', assignee: null, ...over }) as Proposal

function actionDeps() {
  return { setBusyId: vi.fn(), fetchProposals: vi.fn(), info: vi.fn(), error: vi.fn() }
}

describe('runBoardAction', () => {
  it('marca o card ocupado durante a ação e libera no fim', async () => {
    const deps = actionDeps()
    const action = vi.fn(async () => {
      expect(deps.setBusyId).toHaveBeenLastCalledWith('p1')
    })
    await runBoardAction(deps, 'p1', action, 'falhou')
    expect(action).toHaveBeenCalled()
    expect(deps.setBusyId).toHaveBeenLastCalledWith(null)
    expect(deps.error).not.toHaveBeenCalled()
  })

  it('votação encerrada: avisa e recarrega o quadro', async () => {
    const deps = actionDeps()
    await runBoardAction(deps, 'p1', () => Promise.reject(new ApiError(409, 'x', 'voting_closed')), 'falhou')
    expect(deps.info).toHaveBeenCalledWith('A votação dessa proposta já terminou.')
    expect(deps.fetchProposals).toHaveBeenCalled()
    expect(deps.error).not.toHaveBeenCalled()
    expect(deps.setBusyId).toHaveBeenLastCalledWith(null)
  })

  it('outro erro: mostra a mensagem dele, ou o padrão da ação', async () => {
    const deps = actionDeps()
    await runBoardAction(deps, 'p1', () => Promise.reject(new ApiError(500, 'caiu', 'other')), 'falhou')
    await runBoardAction(deps, 'p1', () => Promise.reject('?'), 'falhou')
    expect(deps.error.mock.calls).toEqual([['caiu'], ['falhou']])
    expect(deps.fetchProposals).not.toHaveBeenCalled()
  })
})

describe('setStatusOrAskTakeover', () => {
  const deps = () => ({ setStatus: vi.fn(), fetchProposals: vi.fn(async () => {}), askTakeover: vi.fn() })

  it('move direto quando dá certo', async () => {
    const d = deps()
    await setStatusOrAskTakeover(d, 'p1', 'in_progress', true)
    expect(d.setStatus).toHaveBeenCalledWith('p1', 'in_progress', true)
    expect(d.fetchProposals).not.toHaveBeenCalled()
  })

  it('conflito de responsável: recarrega e pede a confirmação de novo', async () => {
    const d = deps()
    d.setStatus.mockRejectedValue(new ApiError(409, 'x', 'assignee_conflict'))
    await setStatusOrAskTakeover(d, 'p1', 'in_progress', false)
    expect(d.fetchProposals).toHaveBeenCalled()
    expect(d.askTakeover).toHaveBeenCalledWith({ id: 'p1', status: 'in_progress' })
  })

  it('outro erro: recarrega e repassa o erro', async () => {
    const d = deps()
    const err = new Error('caiu')
    d.setStatus.mockRejectedValue(err)
    await expect(setStatusOrAskTakeover(d, 'p1', 'in_progress', false)).rejects.toBe(err)
    expect(d.fetchProposals).toHaveBeenCalled()
    expect(d.askTakeover).not.toHaveBeenCalled()
  })
})

describe('routeMove', () => {
  const routes = () => ({ confirmClose: vi.fn(), confirmTakeover: vi.fn(), move: vi.fn(async () => {}) })

  it('card que não existe ou destino proibido: nada', async () => {
    const r = routes()
    await routeMove(undefined, 'in_progress', 'me', r)
    await routeMove(card({ status: 'proposed' }), 'proposed', 'me', r)
    await routeMove(card({ status: 'proposed' }), 'voting', 'me', r)
    expect(r.confirmClose).not.toHaveBeenCalled()
    expect(r.confirmTakeover).not.toHaveBeenCalled()
    expect(r.move).not.toHaveBeenCalled()
  })

  it('tirar da votação pede confirmação de encerrar', async () => {
    const r = routes()
    await routeMove(card({ status: 'voting' }), 'proposed', 'me', r)
    expect(r.confirmClose).toHaveBeenCalledWith({ id: 'p1', status: 'proposed' })
    expect(r.move).not.toHaveBeenCalled()
  })

  it('card com outro dev pede confirmação de tomar a tarefa', async () => {
    const r = routes()
    await routeMove(card({ assignee: { id: 'outro' } as Proposal['assignee'] }), 'in_progress', 'me', r)
    expect(r.confirmTakeover).toHaveBeenCalledWith({ id: 'p1', status: 'in_progress' })
    expect(r.move).not.toHaveBeenCalled()
  })

  it('sem confirmação: move', async () => {
    const r = routes()
    await routeMove(card(), 'in_progress', 'me', r)
    expect(r.move).toHaveBeenCalledWith('p1', 'in_progress')
  })
})

describe('routeDrop', () => {
  const routes = () => ({ votingClosed: vi.fn(), move: vi.fn() })

  it('sem card ou fora de uma coluna: nada', () => {
    const r = routes()
    routeDrop(undefined, 'in_progress', r)
    routeDrop(card(), null, r)
    expect(r.votingClosed).not.toHaveBeenCalled()
    expect(r.move).not.toHaveBeenCalled()
  })

  it('soltar em "Em votação" vindo de outra coluna avisa que não reabre', () => {
    const r = routes()
    routeDrop(card({ status: 'proposed' }), 'voting', r)
    expect(r.votingClosed).toHaveBeenCalled()
    expect(r.move).not.toHaveBeenCalled()
  })

  it('soltar na mesma coluna não faz nada; em outra, pede a mudança', () => {
    const r = routes()
    routeDrop(card({ status: 'voting' }), 'voting', r)
    routeDrop(card({ status: 'proposed' }), 'proposed', r)
    expect(r.move).not.toHaveBeenCalled()
    routeDrop(card({ status: 'proposed' }), 'in_progress', r)
    expect(r.move).toHaveBeenCalledWith('p1', 'in_progress')
    expect(r.votingClosed).not.toHaveBeenCalled()
  })
})

describe('auxiliares do quadro', () => {
  const list = [card({ id: 'a' }), card({ id: 'b', status: 'voting', assignee: { id: 'x' } as Proposal['assignee'] })]

  it('findProposal: acha pelo id; sem id ou id sumido, null', () => {
    expect(findProposal(list, 'b')?.id).toBe('b')
    expect(findProposal(list, 'z')).toBeNull()
    expect(findProposal(list, null)).toBeNull()
  })

  it('pendingTarget: o card ainda existe e passa na condição', () => {
    expect(pendingTarget(list, { id: 'b', status: 'proposed' }, () => true)).toEqual({ card: list[1], status: 'proposed' })
    expect(pendingTarget(list, { id: 'b', status: 'proposed' }, () => false)).toBeNull()
    expect(pendingTarget(list, { id: 'z', status: 'proposed' }, () => true)).toBeNull()
    expect(pendingTarget(list, null, () => true)).toBeNull()
  })

  it('shouldDropSelection: só com card escolhido, carregado e sumido', () => {
    expect(shouldDropSelection('a', false, null)).toBe(true)
    expect(shouldDropSelection('a', true, null)).toBe(false)
    expect(shouldDropSelection('a', false, list[0])).toBe(false)
    expect(shouldDropSelection(null, false, null)).toBe(false)
  })

  it('hasMentionFor: menção pendente do card aberto', () => {
    const mentions = [{ proposal_id: 'a' }]
    expect(hasMentionFor(mentions, 'a')).toBe(true)
    expect(hasMentionFor(mentions, 'b')).toBe(false)
    expect(hasMentionFor(mentions, null)).toBe(false)
  })

  it('showRejectZone: arrastando card não recusado com a coluna oculta', () => {
    expect(showRejectZone(list[0], false)).toBe(true)
    expect(showRejectZone(list[0], true)).toBe(false)
    expect(showRejectZone(card({ status: 'rejected' }), false)).toBe(false)
    expect(showRejectZone(null, false)).toBe(false)
  })
})
