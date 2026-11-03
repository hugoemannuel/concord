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

  // Só guarda a assinatura depois que o render deu certo.
  function draw(scr, upd, fail) {
    const nodes = describe(scr || SO_AVISO, { now: now(), updatedAt: upd, failed: fail });
    const sig = JSON.stringify(nodes);
    if (sig === assinatura) return;
    render(root, nodes, doc);
    assinatura = sig;
  }

  // Erro de tela não pode escapar: o tick e o ciclo seguem vivos.
  function paint() {
    try {
      draw(screen, updatedAt, failed);
    } catch {
      // mantém o que já está na tela
    }
  }

  async function atualizar() {
    const agenda = await loadAgenda(fetchJson);
    const vivos = await loadLive(agenda, now(), fetchJson);
    return { data: mergeLive(agenda, vivos), vivos };
  }

  // Calcula e desenha com locais; só confirma o estado se tudo deu certo.
  function aplicar({ data, vivos }) {
    const novaTela = buildScreen(data, vivos, now());
    const quando = now();
    const proximo = nextPoll(data, quando);
    const fala = announce(novaTela);
    draw(novaTela, quando, false);
    teamsData = data;
    screen = novaTela;
    updatedAt = quando;
    failed = false;
    delay = proximo;
    updateAnnouncement(anuncio, fala);
  }

  function falhou() {
    failed = true;
    if (!teamsData) delay = EMPTY_DELAY;
    paint();
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
    try {
      if (resultado) aplicar(resultado);
      else falhou();
    } catch {
      falhou();
    } finally {
      if (!doc.hidden) timer = setTimeout(cycle, delay);
    }
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
    cycle().catch(() => {});
  }

  doc.addEventListener('visibilitychange', onVisibility);
  if (!doc.hidden) startTicker();
  cycle().catch(() => {});

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
