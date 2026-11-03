import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeEvent } from './espn.js';
import { buildScreen } from './rules.js';
import { describe, render } from './view.js';

const NOW = Date.parse('2026-11-02T12:00:00Z');
const ler = (nome) => readFileSync(new URL(`./${nome}`, import.meta.url), 'utf8');

const side = (id, name, score = 0, logo = null) => ({ id, name, logo, score });
function match(id, status, over = {}) {
  return {
    id, league: 'Brazilian Serie A', leagueSlug: 'bra.1', stage: null, leg: null, aggregate: null,
    startsAt: '2026-11-07T21:30:00Z', status, minute: null,
    home: side('7632', 'Atlético-MG'), away: side('2022', 'Cruzeiro'),
    goals: [], shootout: null, ...over,
  };
}
const galo = (past, upcoming) => ({ id: '7632', name: 'Atlético-MG', past, upcoming });
const cruz = (past, upcoming) => ({ id: '2022', name: 'Cruzeiro', past, upcoming });
const ctx = { now: NOW, updatedAt: NOW - 20000, failed: false };

// Percorre a árvore: todos os nós, todos os textos.
function nos(lista) {
  return lista.flatMap((n) => [n, ...nos(n.children || [])]);
}
const textos = (lista) => nos(lista).map((n) => n.text).filter((t) => typeof t === 'string');

test('estado A: selo, placar, gol de pênalti e aria-live', () => {
  const live = match('1', 'live', {
    minute: "67'", leagueSlug: 'bra.copa_do_brazil', stage: 'Semifinal', leg: 'volta',
    aggregate: { home: 3, away: 2 },
    home: side('7632', 'Atlético-MG', 2, 'https://a.espncdn.com/x.png'),
    away: side('6086', 'Botafogo', 1),
    goals: [
      { teamId: '7632', player: 'Hulk', minute: "12'", ownGoal: false, penalty: true },
      { teamId: '6086', player: 'Savarino', minute: "40'", ownGoal: true, penalty: false },
    ],
  });
  const s = buildScreen([galo([], [live]), cruz([], [match('9', 'scheduled')])], new Map(), NOW);
  const arvore = describe(s, ctx);
  const t = textos(arvore);
  assert.ok(t.includes("AO VIVO 67'"));
  assert.ok(t.includes('2 × 1'));
  assert.ok(t.includes("Hulk 12' (pên.)"));
  assert.ok(t.includes("Savarino 40' (contra)"));
  assert.ok(t.includes('Agregado 3 × 2'));
  assert.ok(t.includes('Copa do Brasil · Semifinal · volta'));
  assert.ok(nos(arvore).some((n) => n.attrs && n.attrs['aria-live'] === 'polite'));
  assert.ok(nos(arvore).some((n) => n.tag === 'svg' && n.attrs['aria-hidden'] === 'true'));
});

test('estado A com fixture da ESPN', () => {
  const sb = JSON.parse(ler('fixtures/scoreboard-ao-vivo.json'));
  const m = normalizeEvent(sb.events[0], sb.leagues[0]);
  const s = buildScreen([galo([], [m])], new Map(), NOW);
  const t = textos(describe(s, ctx));
  assert.ok(t.includes("AO VIVO 67'"));
  assert.ok(t.includes(`${m.home.score} × ${m.away.score}`));
});

test('selo sem minuto, intervalo, placar nulo e disputa de pênaltis', () => {
  const a = match('1', 'live', { home: side('7632', 'Atlético-MG', null), away: side('9', 'Vasco', null) });
  const ta = textos(describe(buildScreen([galo([], [a])], new Map(), NOW), ctx));
  assert.ok(ta.includes('– × –'));
  assert.ok(ta.includes('AO VIVO'));
  const h = match('2', 'halftime', { shootout: { home: 4, away: 3 } });
  const t = textos(describe(buildScreen([galo([], [h])], new Map(), NOW), ctx));
  assert.ok(t.includes('AO VIVO Intervalo'));
  assert.ok(t.includes('pên. 4 × 3'));
});

test('estado B: sem jogo, próximo e último', () => {
  const prox = match('3', 'scheduled', {
    home: side('2022', 'Cruzeiro'), away: side('9', 'Grêmio'),
  });
  const proxGalo = match('4', 'scheduled', {
    home: side('8', 'Botafogo'), away: side('7632', 'Atlético-MG'),
  });
  const ult = match('5', 'finished', {
    home: side('2022', 'Cruzeiro', 2), away: side('8', 'Vasco', 0),
  });
  const pen = match('6', 'finished', {
    home: side('7632', 'Atlético-MG', 1), away: side('8', 'Bahia', 1), shootout: { home: 4, away: 3 },
  });
  const s = buildScreen([galo([pen], [proxGalo]), cruz([ult], [prox])], new Map(), NOW);
  const t = textos(describe(s, ctx));
  assert.ok(t.includes('Nenhuma partida em andamento.'));
  assert.ok(t.includes('Próximo: x Grêmio (casa) · sáb 18:30 · Brasileirão'));
  assert.ok(t.includes('Próximo: x Botafogo (fora) · sáb 18:30 · Brasileirão'));
  assert.ok(t.includes('Último: 2 × 0 Vasco'));
  assert.ok(t.includes('Último: 1 × 1 Bahia (pên. 4 × 3)'));
  assert.deepEqual(t.filter((x) => ['V', 'E', 'D'].includes(x)), ['V', 'V']);
  assert.ok(t.includes('Atualizado há 20 s · dados ESPN'));
});

test('estado C: clássico tem um único cartão ao vivo', () => {
  const c = match('1', 'halftime', { stage: 'Final', leagueSlug: 'bra.camp.mineiro' });
  const arvore = describe(buildScreen([galo([], [c]), cruz([], [c])], new Map(), NOW), ctx);
  assert.equal(nos(arvore).filter((n) => n.attrs && n.attrs['aria-live']).length, 1);
  assert.ok(textos(arvore).includes('Mineiro · Final'));
  assert.ok(!textos(arvore).includes('Nenhuma partida em andamento.'));
});

test('failed mostra o aviso e mantém os cartões', () => {
  const s = buildScreen([galo([], [match('3', 'scheduled')])], new Map(), NOW);
  const t = textos(describe(s, { ...ctx, failed: true }));
  assert.ok(t.includes('Não deu para atualizar o placar agora.'));
  assert.ok(t.some((x) => x.startsWith('Próximo:')));
});

test('logo null não gera img; logo fora da ESPN também não', () => {
  const live = match('1', 'live', {
    home: side('7632', 'Atlético-MG', 0, null), away: side('9', 'Vasco', 0, 'https://evil.example/x.png'),
  });
  const arvore = describe(buildScreen([galo([], [live])], new Map(), NOW), ctx);
  assert.equal(nos(arvore).filter((n) => n.tag === 'img').length, 0);
  const ok = match('2', 'live', { home: side('7632', 'Atlético-MG', 0, 'https://a.espncdn.com/a.png') });
  const imgs = nos(describe(buildScreen([galo([], [ok])], new Map(), NOW), ctx)).filter((n) => n.tag === 'img');
  assert.equal(imgs.length, 1);
  assert.equal(imgs[0].attrs.alt, 'Atlético-MG');
});

function fakeDoc() {
  const mk = (tag) => ({
    tag, attrs: {}, children: [], textContent: '',
    setAttribute(k, v) { this.attrs[k] = v; },
    append(...f) { this.children.push(...f); },
    appendChild(f) { this.children.push(f); return f; },
    replaceChildren(...f) { this.children = f; },
    set innerHTML(_) { throw new Error('innerHTML proibido'); },
  });
  return { createElement: mk, createElementNS: (_ns, tag) => mk(tag) };
}

test('render monta com createElement/textContent, sem innerHTML', () => {
  const live = match('1', 'live', {
    minute: "5'", home: side('7632', 'Atlético-MG', 1, 'https://a.espncdn.com/a.png'),
    goals: [{ teamId: '7632', player: 'Hulk', minute: "3'", ownGoal: false, penalty: false }],
  });
  const doc = fakeDoc();
  const root = doc.createElement('main');
  render(root, describe(buildScreen([galo([], [live])], new Map(), NOW), ctx), doc);
  assert.ok(root.children.length > 0);
  const todos = (e) => [e, ...e.children.flatMap(todos)];
  const all = todos(root);
  assert.ok(all.some((e) => e.textContent === "AO VIVO 5'"));
  assert.ok(all.some((e) => e.tag === 'svg' && e.attrs['aria-hidden'] === 'true'));
  assert.ok(all.some((e) => e.tag === 'img' && e.attrs.src === 'https://a.espncdn.com/a.png'));
});

test('fonte de view.js não usa innerHTML, outerHTML nem insertAdjacentHTML', () => {
  const src = ler('view.js');
  for (const proibido of ['innerHTML', 'outerHTML', 'insertAdjacentHTML']) {
    assert.ok(!src.includes(proibido), proibido);
  }
});

test('index.html tem a CSP exata e a estrutura', () => {
  const html = ler('index.html');
  const csp = "default-src 'none'; script-src 'self'; style-src 'self'; img-src https://a.espncdn.com; connect-src https://site.api.espn.com; base-uri 'none'; form-action 'none'";
  assert.ok(html.includes(`<meta http-equiv="Content-Security-Policy" content="${csp}">`));
  assert.ok(html.includes('<html lang="pt-BR">'));
  assert.ok(html.includes('<main id="placar">'));
  assert.ok(html.includes('<link rel="stylesheet" href="placar.css">'));
  assert.ok(html.includes('<script type="module" src="app.js"></script>'));
  assert.ok(html.includes('name="viewport"'));
});
