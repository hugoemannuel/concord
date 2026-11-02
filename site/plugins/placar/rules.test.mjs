import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildScreen, nextPoll, liveCandidates, result, leagueLabel, stageLabel,
  whenLabel, agoLabel, statusLabel,
} from './rules.js';

const NOW = Date.parse('2026-11-02T12:00:00Z');
const min = (n) => new Date(NOW + n * 60000).toISOString();

function match(id, status, over = {}) {
  return {
    id, league: 'Brazilian Serie A', leagueSlug: 'bra.1', stage: null, leg: null, aggregate: null,
    startsAt: min(-120), status, minute: null,
    home: { id: '7632', name: 'Atlético-MG', logo: null, score: 0 },
    away: { id: '2022', name: 'Cruzeiro', logo: null, score: 0 },
    goals: [], shootout: null, ...over,
  };
}
const galo = (past, upcoming) => ({ id: '7632', name: 'Atlético-MG', past, upcoming });
const cruz = (past, upcoming) => ({ id: '2022', name: 'Cruzeiro', past, upcoming });
const other = (id, name) => ({ id, name, logo: null, score: 0 });

test('clássico ao vivo vira um só e tira os dois times de teams', () => {
  const c = match('1', 'live', { minute: "67'" });
  const s = buildScreen([galo([], [c]), cruz([], [c])], new Map(), NOW);
  assert.equal(s.live.length, 1);
  assert.equal(s.teams.length, 0);
  assert.equal(s.empty, false);
});

test('dois jogos ao vivo de times diferentes: 2 cartões e 0 em teams', () => {
  const a = match('1', 'live', { away: other('9', 'Vasco') });
  const b = match('2', 'halftime', { home: other('9', 'Grêmio') });
  const s = buildScreen([galo([], [a]), cruz([], [b])], new Map(), NOW);
  assert.equal(s.live.length, 2);
  assert.equal(s.teams.length, 0);
});

test('só o Galo ao vivo: teams só com o Cruzeiro', () => {
  const a = match('1', 'live', { away: other('9', 'Vasco') });
  const n = match('3', 'scheduled', { startsAt: min(3000) });
  const s = buildScreen([galo([], [a]), cruz([], [n])], new Map(), NOW);
  assert.equal(s.live.length, 1);
  assert.deepEqual(s.teams.map((t) => t.id), ['2022']);
});

test('liveById sobrescreve o status da agenda', () => {
  const agenda = match('1', 'scheduled', { startsAt: min(-1) });
  const placar = match('1', 'live', { minute: "1'" });
  const s = buildScreen([galo([], [agenda])], new Map([['1', placar]]), NOW);
  assert.equal(s.live.length, 1);
  assert.equal(s.live[0].status, 'live');
});

test('sem ao vivo: empty e os 2 times com next e last', () => {
  const n1 = match('3', 'scheduled', { startsAt: min(3000) });
  const n2 = match('4', 'scheduled', { startsAt: min(4000) });
  const s = buildScreen([galo([match('5', 'finished')], [n1]), cruz([match('6', 'finished')], [n2])], new Map(), NOW);
  assert.equal(s.empty, true);
  assert.equal(s.teams.length, 2);
  assert.equal(s.teams[0].next.id, '3');
  assert.equal(s.teams[1].last.id, '6');
});

test('next aceita adiado e last só encerrado', () => {
  const s = buildScreen(
    [galo([match('5', 'postponed'), match('6', 'finished')], [match('7', 'postponed')])],
    new Map(), NOW,
  );
  assert.equal(s.teams[0].next.id, '7');
  assert.equal(s.teams[0].last.id, '6');
});

test('nextPoll: ao vivo 30 s, em 10 min 30 s, em 2 h 5 min', () => {
  assert.equal(nextPoll([galo([], [match('1', 'live')])], NOW), 30000);
  assert.equal(nextPoll([galo([], [match('1', 'halftime')])], NOW), 30000);
  assert.equal(nextPoll([galo([], [match('1', 'scheduled', { startsAt: min(10) })])], NOW), 30000);
  assert.equal(nextPoll([galo([], [match('1', 'scheduled', { startsAt: min(120) })])], NOW), 300000);
  assert.equal(nextPoll([galo([match('2', 'finished')], [])], NOW), 300000);
});

test('Review Focus 1: scheduled 5 min no passado vale 30 s e é candidato', () => {
  const atrasado = match('1', 'scheduled', { startsAt: min(-5) });
  const longe = match('2', 'scheduled', { startsAt: min(600) });
  const d = [galo([], [atrasado, longe])];
  assert.equal(nextPoll(d, NOW), 30000);
  assert.deepEqual(liveCandidates(d, NOW), [{ slug: 'bra.1', eventId: '1' }]);
});

test('jogo agendado parado há mais de 6 h não prende o plugin em 30 s', () => {
  const preso = match('1', 'scheduled', { startsAt: min(-7 * 60) });
  assert.equal(nextPoll([galo([], [preso])], NOW), 300000);
});

test('liveCandidates: sem repetir o clássico e ignorando liga desconhecida', () => {
  const c = match('1', 'live');
  const sem = match('2', 'live', { leagueSlug: null });
  const d = [galo([], [c, sem]), cruz([], [c])];
  assert.deepEqual(liveCandidates(d, NOW), [{ slug: 'bra.1', eventId: '1' }]);
});

test('result: V, E, D e pênaltis', () => {
  const m = (h, a, shootout = null) => match('1', 'finished', {
    home: { ...other('7632', 'A'), score: h }, away: { ...other('9', 'B'), score: a }, shootout,
  });
  assert.equal(result(m(2, 0), '7632'), 'V');
  assert.equal(result(m(1, 1), '7632'), 'E');
  assert.equal(result(m(0, 1), '7632'), 'D');
  assert.equal(result(m(1, 1, { home: 4, away: 3 }), '7632'), 'V');
  assert.equal(result(m(1, 1, { home: 4, away: 3 }), '9'), 'D');
  assert.equal(result(m(2, 0), '9'), 'D');
});

test('leagueLabel traduz as conhecidas e devolve o nome da ESPN nas outras', () => {
  assert.equal(leagueLabel(match('1', 'live', { leagueSlug: 'bra.copa_do_brazil' })), 'Copa do Brasil');
  assert.equal(leagueLabel(match('1', 'live', { leagueSlug: 'bra.1' })), 'Brasileirão');
  assert.equal(leagueLabel(match('1', 'live', { leagueSlug: 'bra.camp.mineiro' })), 'Mineiro');
  assert.equal(leagueLabel(match('1', 'live', { leagueSlug: null, league: 'Liga X' })), 'Liga X');
});

test('whenLabel usa o fuso de Brasília (Review Focus 5)', () => {
  assert.equal(whenLabel('2026-11-05T00:30:00Z'), 'qua 21:30');
  assert.equal(whenLabel('2026-11-07T21:30:00Z'), 'sáb 18:30');
});

test('agoLabel', () => {
  assert.equal(agoLabel(NOW - 20000, NOW), 'Atualizado há 20 s');
  assert.equal(agoLabel(NOW - 190000, NOW), 'Atualizado há 3 min');
});

test('stageLabel', () => {
  assert.equal(stageLabel(match('1', 'live', { stage: 'Semifinal', leg: 'ida' })), 'Semifinal · ida');
  assert.equal(stageLabel(match('1', 'live', { stage: 'Final' })), 'Final');
  assert.equal(stageLabel(match('1', 'live')), null);
});

test('statusLabel', () => {
  assert.equal(statusLabel(match('1', 'live', { minute: "67'" })), "AO VIVO 67'");
  assert.equal(statusLabel(match('1', 'halftime')), 'AO VIVO Intervalo');
  assert.equal(statusLabel(match('1', 'finished')), 'Encerrado');
  assert.equal(statusLabel(match('1', 'postponed')), 'Adiado');
  assert.equal(statusLabel(match('1', 'canceled')), 'Cancelado');
});
