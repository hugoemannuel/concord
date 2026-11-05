// Regras puras do que a tela mostra: sem DOM e sem rede, só dados do Match
// (ver espn.js) entrando e decisões saindo.

const POLL_FAST = 30000;
const POLL_SLOW = 300000;
const SOON_MS = 15 * 60000; // jogo que começa em até 15 min já é acompanhado de perto
const STALE_MS = 6 * 3600000; // agendado há mais que isso: dado preso na ESPN, não jogo atrasado

const LEAGUES = {
  'bra.1': 'Brasileirão',
  'bra.copa_do_brazil': 'Copa do Brasil',
  'conmebol.libertadores': 'Libertadores',
  'conmebol.sudamericana': 'Sul-Americana',
  'bra.camp.mineiro': 'Mineiro',
};

const STATUS = { finished: 'Encerrado', postponed: 'Adiado', canceled: 'Cancelado' };

const isLive = (m) => m.status === 'live' || m.status === 'halftime';

// Em andamento, ou agendado que começa em até 15 min ou já passou do horário
// sem encerrar (a ESPN demora a virar o status).
function needsWatching(m, now) {
  if (isLive(m)) return true;
  if (m.status !== 'scheduled') return false;
  const diff = Date.parse(m.startsAt) - now;
  return Number.isFinite(diff) && diff <= SOON_MS && diff > -STALE_MS;
}

function allMatches(teamsData) {
  return teamsData.flatMap((t) => [...t.past, ...t.upcoming]);
}

export function nextPoll(teamsData, now) {
  const t = new Date(now).getTime();
  return allMatches(teamsData).some((m) => needsWatching(m, t)) ? POLL_FAST : POLL_SLOW;
}

export function liveCandidates(teamsData, now) {
  const t = new Date(now).getTime();
  const vistos = new Set();
  const lista = [];
  for (const m of allMatches(teamsData)) {
    if (!m.leagueSlug || vistos.has(m.id) || !needsWatching(m, t)) continue;
    vistos.add(m.id);
    lista.push({ slug: m.leagueSlug, eventId: m.id });
  }
  return lista;
}

// O scoreboard, quando traz o jogo, manda mais que a agenda.
function liveMatches(teamsData, liveById) {
  const porId = new Map();
  for (const m of allMatches(teamsData)) {
    const atual = liveById.get(m.id) || m;
    if (isLive(atual) && !porId.has(atual.id)) porId.set(atual.id, atual);
  }
  return [...porId.values()];
}

const NEXT_STATUS = new Set(['scheduled', 'postponed', 'canceled']);

export function buildScreen(teamsData, liveById, now) {
  const live = liveMatches(teamsData, liveById);
  const ids = new Set(live.map((m) => m.id));
  const teams = teamsData
    .filter((t) => ![...t.past, ...t.upcoming].some((m) => ids.has(m.id)))
    .map((t) => ({
      id: t.id,
      name: t.name,
      next: t.upcoming.find((m) => NEXT_STATUS.has(m.status)) || null,
      last: t.past.find((m) => m.status === 'finished') || null,
    }));
  return { live, teams, empty: live.length === 0 };
}

export function result(match, teamId) {
  const casa = match.home.id === teamId;
  const [meu, dele] = casa ? [match.home.score, match.away.score] : [match.away.score, match.home.score];
  let [a, b] = [meu, dele];
  if (a === b && match.shootout) {
    [a, b] = casa ? [match.shootout.home, match.shootout.away] : [match.shootout.away, match.shootout.home];
  }
  if (a === b) return 'E';
  return a > b ? 'V' : 'D';
}

export function leagueLabel(match) {
  return LEAGUES[match.leagueSlug] || match.league;
}

// O Match não traz o número da rodada: só fase e perna.
export function stageLabel(match) {
  if (!match.stage) return null;
  return match.leg ? `${match.stage} · ${match.leg}` : match.stage;
}

export function whenLabel(iso) {
  if (Number.isNaN(new Date(iso).getTime())) return '';
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (tipo) => partes.find((p) => p.type === tipo).value;
  const dia = get('weekday').replace('.', '').toLowerCase();
  return `${dia} ${get('hour')}:${get('minute')}`;
}

export function agoLabel(updatedAt, now) {
  const seg = Math.max(0, Math.round((new Date(now).getTime() - new Date(updatedAt).getTime()) / 1000));
  return seg < 60 ? `Atualizado há ${seg} s` : `Atualizado há ${Math.floor(seg / 60)} min`;
}

export function statusLabel(match) {
  if (match.status === 'halftime') return 'AO VIVO Intervalo';
  if (match.status === 'live') return match.minute ? `AO VIVO ${match.minute}` : 'AO VIVO';
  return STATUS[match.status] || '';
}
