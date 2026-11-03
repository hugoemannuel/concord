// Ciclo de atualização: busca a agenda, confere os jogos em andamento no
// scoreboard, monta a tela e agenda o próximo ciclo. Tudo é injetado para teste.
import { TEAMS, fetchTeam, fetchLive } from './espn.js';
import { buildScreen, nextPoll, liveCandidates } from './rules.js';
import { describe, render, announce, updateAnnouncement } from './view.js';

const EMPTY_DELAY = 30000;
const TICK_MS = 1000;

const SO_AVISO = { live: [], teams: [], empty: false };

// O scoreboard manda mais que a agenda: troca o jogo pelo id e, se ele já
// terminou, tira de "próximos" para que não volte como o próximo do time.
export function mergeLive(teamsData, liveById) {
  const troca = (m) => liveById.get(m.id) || m;
  const when = (m) => Date.parse(m.startsAt) || 0;
  return teamsData.map((t) => {
    const past = t.past.map(troca);
    const upcoming = [];
    for (const m of t.upcoming.map(troca)) {
      if (m.status === 'finished') past.push(m);
      else upcoming.push(m);
    }
    return { ...t, past: past.sort((a, b) => when(b) - when(a)), upcoming };
  });
}

function loadAgenda(fetchJson) {
  return Promise.all(
    TEAMS.map(async (t) => ({ id: t.id, name: t.name, ...(await fetchTeam(t.id, fetchJson)) })),
  );
}

// Falha de um jogo = aquele jogo não foi atualizado; a agenda continua valendo.
async function loadLive(agenda, now, fetchJson) {
  const porId = new Map();
  await Promise.all(liveCandidates(agenda, now).map(async (c) => {
    try {
      const m = await fetchLive(c.slug, c.eventId, fetchJson);
      if (m) porId.set(m.id, m);
    } catch {
      // fica como a agenda trouxe
    }
  }));
  return porId;
}

export function startPlacar({ root, fetchJson, now, setTimeout, clearTimeout, setInterval, clearInterval, doc }) {
  const anuncio = doc.getElementById('anuncio');
  let teamsData = null;
  let screen = null;
  let updatedAt = null;
  let failed = false;
  let delay = EMPTY_DELAY;
  let timer = null;
  let ticker = null;
  let geracao = 0;
  let parado = false;
  let assinatura = '';

  function paint() {
    const nodes = describe(screen || SO_AVISO, { now: now(), updatedAt, failed });
    const sig = JSON.stringify(nodes);
    if (sig === assinatura) return;
    assinatura = sig;
    render(root, nodes, doc);
  }

  async function atualizar() {
    const agenda = await loadAgenda(fetchJson);
    const vivos = await loadLive(agenda, now(), fetchJson);
    return { data: mergeLive(agenda, vivos), vivos };
  }

  function aplicar({ data, vivos }) {
    teamsData = data;
    screen = buildScreen(data, vivos, now());
    updatedAt = now();
    failed = false;
    delay = nextPoll(data, now());
    updateAnnouncement(anuncio, announce(screen));
  }

  async function cycle() {
    const minha = ++geracao;
    let resultado = null;
    try {
      resultado = await atualizar();
    } catch {
      resultado = null;
    }
    if (minha !== geracao || parado) return;
    if (resultado) aplicar(resultado);
    else {
      failed = true;
      if (!teamsData) delay = EMPTY_DELAY;
    }
    paint();
    if (!doc.hidden) timer = setTimeout(cycle, delay);
  }

  function startTicker() {
    if (!ticker) ticker = setInterval(paint, TICK_MS);
  }
  function stopTicker() {
    if (ticker) clearInterval(ticker);
    ticker = null;
  }
  function stopTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function onVisibility() {
    stopTimer();
    if (doc.hidden) {
      geracao++;
      stopTicker();
      return;
    }
    startTicker();
    cycle();
  }

  doc.addEventListener('visibilitychange', onVisibility);
  startTicker();
  cycle();

  return {
    stop() {
      parado = true;
      geracao++;
      stopTimer();
      stopTicker();
      doc.removeEventListener('visibilitychange', onVisibility);
    },
  };
}

if (typeof document !== 'undefined') {
  const fetchJson = async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };
  startPlacar({
    root: document.getElementById('placar'),
    fetchJson,
    now: () => Date.now(),
    setTimeout: (f, ms) => setTimeout(f, ms),
    clearTimeout: (h) => clearTimeout(h),
    setInterval: (f, ms) => setInterval(f, ms),
    clearInterval: (h) => clearInterval(h),
    doc: document,
  });
}
