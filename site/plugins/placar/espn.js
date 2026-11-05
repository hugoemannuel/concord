// Único módulo que conhece o formato da API pública da ESPN. Normaliza para o
// modelo próprio do plugin (Match); o resto do código não vê JSON da ESPN.

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const HOST_LOGO = 'https://a.espncdn.com/';

export const TEAMS = [
  { id: '7632', name: 'Atlético-MG' },
  { id: '2022', name: 'Cruzeiro' },
];

// Nome, id ou slug da liga na ESPN → slug do scoreboard.
export const LEAGUE_SLUGS = {
  'bra.1': 'bra.1',
  630: 'bra.1',
  'Brazilian Serie A': 'bra.1',
  'Brasileirão': 'bra.1',
  'bra.copa_do_brazil': 'bra.copa_do_brazil',
  8306: 'bra.copa_do_brazil',
  'Copa do Brasil': 'bra.copa_do_brazil',
  'conmebol.libertadores': 'conmebol.libertadores',
  783: 'conmebol.libertadores',
  'CONMEBOL Libertadores': 'conmebol.libertadores',
  'Libertadores': 'conmebol.libertadores',
  'conmebol.sudamericana': 'conmebol.sudamericana',
  5454: 'conmebol.sudamericana',
  'CONMEBOL Sudamericana': 'conmebol.sudamericana',
  'Sul-Americana': 'conmebol.sudamericana',
  'bra.camp.mineiro': 'bra.camp.mineiro',
  10872: 'bra.camp.mineiro',
  'Brazilian Campeonato Mineiro': 'bra.camp.mineiro',
  'Mineiro': 'bra.camp.mineiro',
};

// Fases em inglês (como a ESPN manda, em minúsculas) → português.
const STAGES = {
  final: 'Final',
  semifinals: 'Semifinal',
  semifinal: 'Semifinal',
  quarterfinals: 'Quartas de final',
  quarterfinal: 'Quartas de final',
  'round of 16': 'Oitavas de final',
  'round of 32': '16 avos de final',
  'group stage': 'Fase de grupos',
  'first round': 'Primeira fase',
  'second round': 'Segunda fase',
  'third round': 'Terceira fase',
  'fourth round': 'Quarta fase',
  'fifth round': 'Quinta fase',
};

const LIVE_STATES = new Set(['in']);
const CANCELED = new Set(['STATUS_CANCELED', 'STATUS_CANCELLED', 'STATUS_ABANDONED']);

// Número a partir de "2", 2 ou { value: 2 }; qualquer outra coisa vira null.
function toNumber(raw) {
  const v = raw !== null && typeof raw === 'object' ? raw.value : raw;
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function safeLogo(href) {
  return typeof href === 'string' && href.startsWith(HOST_LOGO) ? href : null;
}

function teamLogo(team) {
  if (team.logo) return safeLogo(team.logo);
  const logos = Array.isArray(team.logos) ? team.logos : [];
  const padrao = logos.find((l) => Array.isArray(l.rel) && l.rel.includes('default')) || logos[0];
  return padrao ? safeLogo(padrao.href) : null;
}

function normalizeSide(competitor) {
  const c = competitor || {};
  const team = c.team || {};
  return {
    id: team.id != null ? String(team.id) : c.id != null ? String(c.id) : null,
    name: team.displayName || team.shortDisplayName || team.location || team.name || '',
    logo: teamLogo(team),
    score: toNumber(c.score),
  };
}

// Agenda e scoreboard diferem em onde guardam os extras: na agenda ficam dentro
// de `score` ({ value, aggregateScore, shootoutScore }), no scoreboard no competidor.
function extra(competitor, campo) {
  const c = competitor || {};
  const dentro = c.score !== null && typeof c.score === 'object' ? c.score[campo] : undefined;
  return toNumber(c[campo] ?? dentro);
}

function pairOrNull(a, b) {
  return a === null || b === null ? null : { home: a, away: b };
}

function pickSides(competitors) {
  const lista = Array.isArray(competitors) ? competitors : [];
  const home = lista.find((c) => c.homeAway === 'home') || lista[0];
  const away = lista.find((c) => c.homeAway === 'away') || lista.find((c) => c !== home);
  return { home, away };
}

function mapStatus(type) {
  const name = (type && type.name) || '';
  if (name === 'STATUS_HALFTIME') return 'halftime';
  if (name === 'STATUS_POSTPONED') return 'postponed';
  if (CANCELED.has(name)) return 'canceled';
  const state = type && type.state;
  if (LIVE_STATES.has(state)) return 'live';
  return state === 'post' ? 'finished' : 'scheduled';
}

function headlines(comp) {
  return (Array.isArray(comp.notes) ? comp.notes : [])
    .map((n) => n.headline || n.text || '')
    .filter(Boolean);
}

function mapLeg(comp) {
  const valor = toNumber(comp.leg);
  if (valor === 1) return 'ida';
  if (valor === 2) return 'volta';
  const h = headlines(comp).find((t) => /^(1st|2nd) Leg/.test(t));
  if (!h) return null;
  return h.startsWith('1st') ? 'ida' : 'volta';
}

function translateStage(texto) {
  const t = String(texto || '').trim();
  if (!t || /^\d{4}\b/.test(t)) return null; // "2026 Brasileiro Serie A": pontos corridos, sem fase
  return STAGES[t.toLowerCase()] || null; // sem tradução aprovada: melhor sem texto que em inglês
}

// scoreboard: series.title; agenda: seasonType.name.
function mapStage(event, comp) {
  const titulo = comp.series && comp.series.title;
  return translateStage(titulo || (event.seasonType && event.seasonType.name));
}

// "2nd Leg - Grêmio lead 2-0 on aggregate": o primeiro número é do time citado.
function aggregateFromNotes(comp, home, away) {
  for (const h of headlines(comp)) {
    const m = h.match(/ - (.+?) (?:win|wins|lead|leads|advance|advances) (\d+)-(\d+) on aggregate/);
    if (!m) continue;
    const [quem, a, b] = [m[1], Number(m[2]), Number(m[3])];
    if (quem === home.name) return { home: a, away: b };
    if (quem === away.name) return { home: b, away: a };
  }
  return null;
}

function mapAggregate(comp, sides, home, away) {
  const direto = pairOrNull(extra(sides.home, 'aggregateScore'), extra(sides.away, 'aggregateScore'));
  return direto || aggregateFromNotes(comp, home, away);
}

function mapGoals(comp) {
  const detalhes = Array.isArray(comp.details) ? comp.details : [];
  return detalhes
    .filter((d) => d.scoringPlay && !d.shootout)
    .map((d) => {
      const atleta = (d.athletesInvolved || [])[0] || {};
      return {
        teamId: d.team && d.team.id != null ? String(d.team.id) : null,
        player: atleta.displayName || atleta.fullName || null,
        minute: (d.clock && d.clock.displayValue) || null,
        ownGoal: !!d.ownGoal,
        penalty: !!d.penaltyKick,
      };
    });
}

// A liga vem do scoreboard (leagues[0]) ou do próprio evento da agenda.
function mapLeague(event, league) {
  const l = league || event.league || {};
  const slug = [l.slug, l.id, l.name]
    .map((k) => (k != null ? LEAGUE_SLUGS[k] : undefined))
    .find(Boolean);
  return { league: l.name || '', leagueSlug: slug || null };
}

export function normalizeEvent(event, league) {
  const ev = event || {};
  const comp = (ev.competitions && ev.competitions[0]) || {};
  const sides = pickSides(comp.competitors);
  const home = normalizeSide(sides.home);
  const away = normalizeSide(sides.away);
  const status = mapStatus(comp.status && comp.status.type);
  const leg = mapLeg(comp);
  const clock = comp.status && comp.status.displayClock;
  return {
    id: ev.id != null ? String(ev.id) : null,
    ...mapLeague(ev, league),
    stage: mapStage(ev, comp),
    leg,
    aggregate: leg === 'volta' ? mapAggregate(comp, sides, home, away) : null,
    startsAt: comp.date || ev.date || null,
    status,
    minute: status === 'live' && clock ? String(clock) : null,
    home,
    away,
    goals: mapGoals(comp),
    shootout: pairOrNull(extra(sides.home, 'shootoutScore'), extra(sides.away, 'shootoutScore')),
  };
}

const time = (m) => Date.parse(m.startsAt) || 0;

export async function fetchTeam(id, fetchJson) {
  const url = `${BASE}/all/teams/${id}/schedule`;
  const [passado, futuro] = await Promise.all([fetchJson(url), fetchJson(`${url}?fixture=true`)]);
  const lista = (j) => ((j && j.events) || []).map((e) => normalizeEvent(e));
  return {
    past: lista(passado).sort((a, b) => time(b) - time(a)),
    upcoming: lista(futuro).sort((a, b) => time(a) - time(b)),
  };
}

export async function fetchLive(slug, eventId, fetchJson) {
  const j = await fetchJson(`${BASE}/${slug}/scoreboard`);
  const ev = ((j && j.events) || []).find((e) => String(e.id) === String(eventId));
  return ev ? normalizeEvent(ev, j.leagues && j.leagues[0]) : null;
}
