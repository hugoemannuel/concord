import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TEAMS, LEAGUE_SLUGS, normalizeEvent, fetchTeam, fetchLive } from './espn.js';

const fx = (nome) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${nome}.json`, import.meta.url), 'utf8'));
const primeiro = (nome) => fx(nome).events[0];
const clone = (o) => JSON.parse(JSON.stringify(o));

test('TEAMS e LEAGUE_SLUGS', () => {
  assert.deepEqual(TEAMS, [
    { id: '7632', name: 'Atlético-MG' },
    { id: '2022', name: 'Cruzeiro' },
  ]);
  assert.equal(LEAGUE_SLUGS['bra.1'], 'bra.1');
  assert.equal(LEAGUE_SLUGS['Copa do Brasil'], 'bra.copa_do_brazil');
  assert.equal(LEAGUE_SLUGS['8306'], 'bra.copa_do_brazil');
  assert.equal(new Set(Object.values(LEAGUE_SLUGS)).size, 5);
});

test('ao vivo: status live e minuto', () => {
  const sb = fx('scoreboard-ao-vivo');
  const m = normalizeEvent(sb.events[0], sb.leagues[0]);
  assert.equal(m.status, 'live');
  assert.equal(m.minute, "67'");
  assert.equal(m.home.score, 0);
  assert.equal(m.away.score, 1);
});

test('intervalo: status halftime e sem minuto', () => {
  const sb = fx('scoreboard-intervalo');
  const m = normalizeEvent(sb.events[0], sb.leagues[0]);
  assert.equal(m.status, 'halftime');
  assert.equal(m.minute, null);
});

test('encerrado: finished, placares numéricos e gols', () => {
  const sb = fx('scoreboard-encerrado');
  const m = normalizeEvent(sb.events[0], sb.leagues[0]);
  assert.equal(m.status, 'finished');
  assert.equal(m.minute, null);
  assert.equal(m.home.score, 2);
  assert.equal(m.away.score, 1);
  assert.equal(m.id, '401909112');
  assert.equal(m.home.id, '7632');
  assert.equal(m.home.name, 'Atlético-MG');
  assert.equal(m.home.logo, 'https://a.espncdn.com/i/teamlogos/soccer/500/7632.png');
  assert.equal(m.league, 'Copa do Brasil');
  assert.equal(m.leagueSlug, 'bra.copa_do_brazil');
  assert.equal(m.startsAt, '2026-09-02T00:00Z');
  assert.deepEqual(m.goals, [
    { teamId: '2022', player: 'Kaio Jorge', minute: "30'", ownGoal: false, penalty: true },
    { teamId: '7632', player: 'Victor Hugo', minute: "77'", ownGoal: false, penalty: false },
    { teamId: '7632', player: 'Fred', minute: "88'", ownGoal: false, penalty: false },
  ]);
  assert.equal(m.shootout, null);
});

test('mata-mata: fase, perna da volta e agregado', () => {
  const sb = fx('scoreboard-encerrado');
  const m = normalizeEvent(sb.events[0], sb.leagues[0]);
  assert.equal(m.stage, 'Quartas de final');
  assert.equal(m.leg, 'volta');
  assert.deepEqual(m.aggregate, { home: 3, away: 2 });
});

test('mata-mata: ida não tem agregado (agenda)', () => {
  const m = normalizeEvent(primeiro('schedule-7632'));
  assert.equal(m.id, '401913109');
  assert.equal(m.stage, 'Semifinal');
  assert.equal(m.leg, 'ida');
  assert.equal(m.aggregate, null);
  assert.equal(m.leagueSlug, 'bra.copa_do_brazil');
  assert.equal(m.status, 'finished');
  assert.equal(m.home.score, 2);
  assert.equal(m.away.score, 0);
  assert.deepEqual(m.goals, []);
});

test('agenda: volta futura traz o agregado das notas', () => {
  const m = normalizeEvent(primeiro('fixture-7632'));
  const volta = fx('fixture-7632').events.map((e) => normalizeEvent(e)).find((x) => x.leg === 'volta');
  assert.ok(volta);
  assert.equal(volta.stage, 'Semifinal');
  assert.equal(volta.status, 'scheduled');
  assert.deepEqual(volta.aggregate, { home: 0, away: 2 });
  assert.equal(m.status, 'scheduled');
  assert.equal(m.home.score, null);
});

test('campeonato de pontos corridos não tem fase nem perna', () => {
  const m = normalizeEvent(primeiro('fixture-7632'));
  assert.equal(m.stage, null);
  assert.equal(m.leg, null);
  assert.equal(m.aggregate, null);
  assert.equal(m.leagueSlug, 'bra.1');
});

test('pênaltis: shootout, gol contra e disputa fora dos gols', () => {
  const sb = fx('scoreboard-penaltis');
  const m = normalizeEvent(sb.events[0], sb.leagues[0]);
  assert.equal(m.status, 'finished');
  assert.deepEqual(m.shootout, { home: 3, away: 1 });
  assert.equal(m.home.score, 4);
  assert.equal(m.away.score, 2);
  assert.equal(m.goals.length, 6);
  const contra = m.goals.find((g) => g.ownGoal);
  assert.equal(contra.player, 'Lyanco');
  assert.equal(contra.teamId, '2674');
  assert.equal(contra.penalty, false);
  assert.ok(m.goals.every((g) => !g.penalty));
});

test('pênaltis: a agenda também traz shootout', () => {
  const m = normalizeEvent(fx('schedule-7632').events[1]);
  assert.deepEqual(m.shootout, { home: 3, away: 1 });
});

test('Review Focus 2: sem logo, logo de outro host e sem score não quebram', () => {
  const sb = fx('scoreboard-encerrado');
  const ev = clone(sb.events[0]);
  const [a, b] = ev.competitions[0].competitors;
  delete a.team.logo;
  b.team.logo = 'https://evil.example.com/x.png';
  delete a.score;
  b.score = '';
  const m = normalizeEvent(ev, sb.leagues[0]);
  assert.equal(m.home.logo, null);
  assert.equal(m.away.logo, null);
  assert.equal(m.home.score, null);
  assert.equal(m.away.score, null);

  const ag = clone(primeiro('schedule-7632'));
  for (const c of ag.competitions[0].competitors) {
    c.team.logos = [{ href: 'http://a.espncdn.com/x.png' }];
    delete c.score;
  }
  const m2 = normalizeEvent(ag);
  assert.equal(m2.home.logo, null);
  assert.equal(m2.home.score, null);
});

test('Review Focus 2: evento sem competidores não lança', () => {
  const ev = clone(primeiro('schedule-7632'));
  ev.competitions[0].competitors = [];
  const m = normalizeEvent(ev);
  assert.equal(m.home.name, '');
  assert.equal(m.home.score, null);
  assert.equal(m.away.logo, null);
  assert.deepEqual(normalizeEvent({}).goals, []);
});

test('o Mineiro real da agenda (Regular Season) não tem fase', () => {
  const ev = fx('schedule-7632').events.find((e) => e.seasonType.name === 'Regular Season');
  assert.ok(ev, 'o fixture precisa ter um evento Regular Season');
  assert.equal(normalizeEvent(ev).stage, null);
});

test('logo de host parecido com o da ESPN é descartado', () => {
  const sb = fx('scoreboard-encerrado');
  const ev = clone(sb.events[0]);
  ev.competitions[0].competitors[0].team.logo = 'https://a.espncdn.com.evil.com/x.png';
  assert.equal(normalizeEvent(ev, sb.leagues[0]).home.logo, null);
});

test('status adiado e cancelado', () => {
  const ev = clone(primeiro('fixture-7632'));
  ev.competitions[0].status.type = { name: 'STATUS_POSTPONED', state: 'post' };
  assert.equal(normalizeEvent(ev).status, 'postponed');
  ev.competitions[0].status.type = { name: 'STATUS_CANCELED', state: 'post' };
  assert.equal(normalizeEvent(ev).status, 'canceled');
});

test('traduz fases do inglês e fase desconhecida fica sem texto', () => {
  const ev = clone(primeiro('fixture-7632'));
  const com = (nome) => {
    ev.seasonType = { name: nome };
    return normalizeEvent(ev).stage;
  };
  assert.equal(com('Final'), 'Final');
  assert.equal(com('Round of 16'), 'Oitavas de final');
  assert.equal(com('Group Stage'), 'Fase de grupos');
  assert.equal(com('Fifth Round'), 'Quinta fase');
  assert.equal(com('Qualifying Whatever'), null);
  assert.equal(com('Regular Season'), null);
  assert.equal(com('2026 Brasileiro Serie A '), null);
});

const falso = (mapa) => async (url) => {
  const r = mapa[url];
  if (!r) throw new Error(`url inesperada: ${url}`);
  return clone(r);
};
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

test('fetchTeam: past decrescente, upcoming crescente', async () => {
  const passado = fx('schedule-7632');
  passado.events.reverse(); // embaralha de propósito
  const futuro = fx('fixture-7632');
  futuro.events.reverse();
  const r = await fetchTeam(
    '7632',
    falso({
      [`${BASE}/all/teams/7632/schedule`]: passado,
      [`${BASE}/all/teams/7632/schedule?fixture=true`]: futuro,
    }),
  );
  const t = (l) => l.map((m) => Date.parse(m.startsAt));
  assert.ok(r.past.length >= 2 && r.upcoming.length >= 2);
  assert.deepEqual(t(r.past), [...t(r.past)].sort((a, b) => b - a));
  assert.deepEqual(t(r.upcoming), [...t(r.upcoming)].sort((a, b) => a - b));
  assert.equal(r.past[0].id, '401913109');
});

test('fetchLive: acha o evento pelo id e usa a liga do scoreboard', async () => {
  const sb = fx('scoreboard-ao-vivo');
  const url = `${BASE}/bra.copa_do_brazil/scoreboard`;
  const m = await fetchLive('bra.copa_do_brazil', '401909112', falso({ [url]: sb }));
  assert.equal(m.status, 'live');
  assert.equal(m.minute, "67'");
  assert.equal(m.leagueSlug, 'bra.copa_do_brazil');
  assert.equal(await fetchLive('bra.copa_do_brazil', '999', falso({ [url]: sb })), null);
});

test('fetchLive: propaga erro do fetchJson', async () => {
  await assert.rejects(() => fetchLive('bra.1', '1', async () => { throw new Error('http 500'); }), /500/);
});
