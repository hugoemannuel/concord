import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startPlacar, mergeLive } from './app.js';
import { normalizeEvent } from './espn.js';

const ler = (nome) => readFileSync(new URL(`./${nome}`, import.meta.url), 'utf8');
const json = (nome) => JSON.parse(ler(`fixtures/${nome}.json`));

const IDLE = Date.parse('2026-11-02T12:00:00Z');
// 10 min antes do primeiro jogo futuro do Galo (401841305): já é acompanhado de perto.
const PERTO = Date.parse('2026-11-05T00:20:00Z');
const ID_JOGO = '401841305';

const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

function fakeEl(tag) {
  return {
    tag, attrs: {}, children: [], textContent: '',
    setAttribute(k, v) { this.attrs[k] = v; },
    appendChild(f) { this.children.push(f); return f; },
    replaceChildren(...f) { this.children = f; },
  };
}
const todos = (e) => [e, ...e.children.flatMap(todos)];
const textosDe = (root) => todos(root).map((e) => e.textContent).filter(Boolean);

function setup({ now = IDLE, scoreboard = 'scoreboard-ao-vivo', falhar = () => false } = {}) {
  const relogio = { t: now };
  const chamadas = [];
  const timeouts = [];
  const intervalos = [];
  let seq = 0;
  const ouvintes = [];
  let escritasAnuncio = 0;
  let textoAnuncio = '';
  const anuncio = {
    get textContent() { return textoAnuncio; },
    set textContent(v) { escritasAnuncio++; textoAnuncio = v; },
  };
  const doc = {
    hidden: false,
    getElementById: (id) => (id === 'anuncio' ? anuncio : null),
    addEventListener: (ev, fn) => ouvintes.push([ev, fn]),
    removeEventListener: (ev, fn) => {
      const i = ouvintes.findIndex(([e, f]) => e === ev && f === fn);
      if (i >= 0) ouvintes.splice(i, 1);
    },
    createElement: fakeEl,
    createElementNS: (_ns, tag) => fakeEl(tag),
  };
  const fetchJson = async (url) => {
    chamadas.push(url);
    if (falhar(url)) throw new Error('rede');
    const m = url.match(/teams\/(\d+)\/schedule(\?fixture=true)?$/);
    if (m) return json(`${m[2] ? 'fixture' : 'schedule'}-${m[1]}`);
    if (url.endsWith('/scoreboard')) {
      const sb = json(scoreboard);
      sb.events[0].id = ID_JOGO;
      return sb;
    }
    throw new Error(`url inesperada ${url}`);
  };
  const root = fakeEl('main');
  const api = startPlacar({
    root, fetchJson, doc, now: () => relogio.t,
    setTimeout: (fn, ms) => { const h = { fn, ms, id: ++seq }; timeouts.push(h); return h; },
    clearTimeout: (h) => { const i = timeouts.indexOf(h); if (i >= 0) timeouts.splice(i, 1); },
    setInterval: (fn, ms) => { const h = { fn, ms, id: ++seq }; intervalos.push(h); return h; },
    clearInterval: (h) => { const i = intervalos.indexOf(h); if (i >= 0) intervalos.splice(i, 1); },
  });
  const visibilidade = (hidden) => {
    doc.hidden = hidden;
    ouvintes.filter(([e]) => e === 'visibilitychange').forEach(([, f]) => f());
  };
  return {
    api, root, chamadas, timeouts, intervalos, relogio, visibilidade, ouvintes,
    anuncio: () => textoAnuncio, escritasAnuncio: () => escritasAnuncio,
  };
}

test('primeiro ciclo sem jogo ao vivo renderiza e agenda 300000', async () => {
  const s = setup();
  await flush();
  const t = textosDe(s.root);
  assert.ok(t.some((x) => x.includes('Nenhuma partida em andamento')));
  assert.ok(t.some((x) => x.includes('dados ESPN')));
  assert.equal(s.timeouts.length, 1);
  assert.equal(s.timeouts[0].ms, 300000);
  assert.equal(s.anuncio(), '');
  assert.ok(!s.chamadas.some((u) => u.endsWith('/scoreboard')));
  s.api.stop();
});

test('com jogo ao vivo: pede o scoreboard da liga certa, agenda 30000 e anuncia', async () => {
  const s = setup({ now: PERTO });
  await flush();
  assert.ok(s.chamadas.some((u) => u.endsWith('/bra.copa_do_brazil/scoreboard') || u.endsWith('/scoreboard')));
  assert.equal(s.timeouts[0].ms, 30000);
  assert.ok(textosDe(s.root).some((x) => x.startsWith('AO VIVO')));
  assert.ok(s.anuncio().includes('·'));
  s.api.stop();
});

test('o tick de 1 s repinta o rodapé sem pedir nada nem tocar no anúncio', async () => {
  const s = setup({ now: PERTO });
  await flush();
  const pedidos = s.chamadas.length;
  const escritas = s.escritasAnuncio();
  s.relogio.t += 45000;
  s.intervalos[0].fn();
  assert.equal(s.intervalos[0].ms, 1000);
  assert.equal(s.chamadas.length, pedidos);
  assert.equal(s.escritasAnuncio(), escritas);
  s.api.stop();
});

test('Review Focus 4: 1ª carga falha mostra só o aviso; o ciclo seguinte o remove', async () => {
  let quebrar = true;
  const s = setup({ falhar: () => quebrar });
  await flush();
  const t = textosDe(s.root);
  assert.deepEqual(t, ['Não deu para atualizar o placar agora.']);
  assert.equal(s.timeouts[0].ms, 30000);
  quebrar = false;
  s.timeouts[0].fn();
  await flush();
  const depois = textosDe(s.root);
  assert.ok(!depois.some((x) => x.includes('Não deu para atualizar')));
  assert.equal(depois.filter((x) => x.includes('Atlético-MG')).length > 0, true);
  const rotulos = todos(s.root).filter((e) => e.attrs && String(e.attrs.class || '').includes('cartao'));
  assert.ok(rotulos.length >= 2);
  assert.equal(s.root.children.filter((c) => String(c.attrs.class).includes('rodape')).length, 1);
  s.api.stop();
});

test('falha depois de sucesso mantém os cartões e liga o aviso, mesmo intervalo', async () => {
  let quebrar = false;
  const s = setup({ falhar: () => quebrar });
  await flush();
  const antes = textosDe(s.root).filter((x) => x.includes('Atlético-MG'));
  assert.ok(antes.length > 0);
  quebrar = true;
  s.timeouts[0].fn();
  await flush();
  const t = textosDe(s.root);
  assert.ok(t.includes('Não deu para atualizar o placar agora.'));
  assert.deepEqual(t.filter((x) => x.includes('Atlético-MG')), antes);
  assert.equal(s.timeouts[0].ms, 300000);
  s.api.stop();
});

test('falha do scoreboard de um jogo não descarta a agenda nem liga o aviso', async () => {
  const s = setup({ now: PERTO, falhar: (u) => u.endsWith('/scoreboard') });
  await flush();
  const t = textosDe(s.root);
  assert.ok(!t.includes('Não deu para atualizar o placar agora.'));
  assert.ok(t.some((x) => x.includes('Atlético-MG')));
  assert.equal(s.timeouts[0].ms, 30000);
  s.api.stop();
});

test('scoreboard que já traz o jogo encerrado: ele não volta como o próximo do time', async () => {
  const s = setup({ now: PERTO, scoreboard: 'scoreboard-encerrado' });
  await flush();
  const t = textosDe(s.root);
  assert.ok(!t.some((x) => x.startsWith('AO VIVO')));
  assert.ok(!t.some((x) => x.startsWith("Próximo") && x.includes("Botafogo")));
  s.api.stop();
});

test('mergeLive troca pelo id e move o encerrado de próximos para últimos', () => {
  const sb = json('scoreboard-encerrado');
  sb.events[0].id = ID_JOGO;
  const fim = normalizeEvent(sb.events[0], sb.leagues[0]);
  const futuro = normalizeEvent(json('fixture-7632').events[0]);
  assert.equal(futuro.id, ID_JOGO);
  const dados = [{ id: '7632', name: 'Atlético-MG', past: [], upcoming: [futuro] }];
  const [t] = mergeLive(dados, new Map([[ID_JOGO, fim]]));
  assert.equal(t.upcoming.length, 0);
  assert.equal(t.past[0].status, 'finished');
});

test('visibilitychange: escondido cancela o timer; visível roda o ciclo na hora', async () => {
  const s = setup();
  await flush();
  assert.equal(s.timeouts.length, 1);
  s.visibilidade(true);
  assert.equal(s.timeouts.length, 0);
  assert.equal(s.intervalos.length, 0);
  const pedidos = s.chamadas.length;
  s.visibilidade(false);
  await flush();
  assert.ok(s.chamadas.length > pedidos);
  assert.equal(s.timeouts.length, 1);
  assert.equal(s.intervalos.length, 1);
  s.api.stop();
});

test('stop() limpa timers e o ouvinte', async () => {
  const s = setup();
  await flush();
  s.api.stop();
  assert.equal(s.timeouts.length, 0);
  assert.equal(s.intervalos.length, 0);
  assert.equal(s.ouvintes.length, 0);
});
