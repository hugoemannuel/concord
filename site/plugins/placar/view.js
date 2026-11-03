// Tela do plugin: transforma o resultado de buildScreen em uma árvore de dados
// ({ tag, attrs, text, children }) e a materializa no DOM só com createElement,
// setAttribute e textContent. Nada de HTML em string: o dado vem de fora.
import {
  leagueLabel, stageLabel, whenLabel, agoLabel, statusLabel, result,
} from './rules.js';

const HOST_LOGO = 'https://a.espncdn.com/';
const SVG_NS = 'http://www.w3.org/2000/svg';
const DASH = '–';

const el = (tag, attrs = {}, children = [], text) => {
  const n = { tag, attrs, children };
  if (text !== undefined) n.text = text;
  return n;
};
const span = (cls, text) => el('span', { class: cls }, [], text);
const div = (cls, children, attrs = {}) => el('div', { class: cls, ...attrs }, children);

const num = (v) => (v === null || v === undefined ? DASH : String(v));
const pair = (a, b) => `${num(a)} × ${num(b)}`;

// Só logo da ESPN vira <img>; o alt é o nome do time (dado).
function logo(team, cls) {
  if (typeof team.logo !== 'string' || !team.logo.startsWith(HOST_LOGO)) return [];
  return [el('img', { class: cls, src: team.logo, alt: team.name })];
}

// Bola simples, decorativa; o render a cria com createElementNS.
function ball() {
  return {
    tag: 'svg', svg: true, children: [
      { tag: 'circle', svg: true, attrs: { cx: '8', cy: '8', r: '7', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5' }, children: [] },
      { tag: 'polygon', svg: true, attrs: { points: '8,4.5 11,6.7 9.9,10.2 6.1,10.2 5,6.7', fill: 'currentColor' }, children: [] },
    ],
    attrs: { class: 'bola', viewBox: '0 0 16 16', width: '12', height: '12', 'aria-hidden': 'true', focusable: 'false' },
  };
}

function goalText(g) {
  const base = [g.player, g.minute].filter(Boolean).join(' ');
  if (g.ownGoal) return `${base} (contra)`;
  return g.penalty ? `${base} (pên.)` : base;
}

function goalItem(g, lado) {
  const texto = span('gol-texto', goalText(g));
  return el('span', { class: 'gol' }, lado === 'home' ? [ball(), texto] : [texto, ball()]);
}

function goalsLine(m) {
  const lado = (id) => m.goals.filter((g) => (g.teamId === m.home.id) === (id === 'home'));
  const col = (id) => div(`gols gols-${id}`, lado(id).map((g) => goalItem(g, id)));
  return div('gols-linha', [col('home'), col('away')]);
}

function teamColumn(team) {
  return div('time', [...logo(team, 'logo'), span('nome', team.name)]);
}

function scoreBlock(m) {
  const extras = [];
  if (m.aggregate) extras.push(span('extra', `Agregado ${pair(m.aggregate.home, m.aggregate.away)}`));
  if (m.shootout) extras.push(span('extra', `pên. ${pair(m.shootout.home, m.shootout.away)}`));
  return div('placar', [span('gols-total', pair(m.home.score, m.away.score)), ...extras]);
}

function liveHeader(m) {
  const stage = stageLabel(m);
  const campeonato = stage ? `${leagueLabel(m)} · ${stage}` : leagueLabel(m);
  return div('topo', [span('campeonato', campeonato), span('selo', statusLabel(m))]);
}

function liveCard(m) {
  const linha = div('confronto', [teamColumn(m.home), scoreBlock(m), teamColumn(m.away)]);
  const goals = m.goals.length ? [goalsLine(m)] : [];
  return div('cartao ao-vivo', [liveHeader(m), linha, ...goals]);
}

function ownSide(match, teamId) {
  const casa = match.home.id === teamId;
  return { casa, meu: casa ? match.home : match.away, outro: casa ? match.away : match.home };
}

function nextRow(match, teamId) {
  const { casa, meu, outro } = ownSide(match, teamId);
  const partes = [`Próximo: x ${outro.name} (${casa ? 'casa' : 'fora'})`];
  if (match.startsAt) partes.push(whenLabel(match.startsAt));
  partes.push(leagueLabel(match));
  const situacao = match.status === 'scheduled' ? [] : [statusLabel(match)];
  return div('mini', [...logo(meu, 'logo-mini'), span('linha', [...partes, ...situacao].join(' · '))]);
}

function lastRow(match, teamId) {
  const { meu, outro } = ownSide(match, teamId);
  const pen = match.shootout && match.home.id === teamId
    ? ` (pên. ${pair(match.shootout.home, match.shootout.away)})`
    : match.shootout ? ` (pên. ${pair(match.shootout.away, match.shootout.home)})` : '';
  const letra = result(match, teamId);
  const texto = `Último: ${pair(meu.score, outro.score)} ${outro.name}${pen}`;
  return div('mini', [
    ...logo(meu, 'logo-mini'), span('linha', texto), span(`res res-${letra}`, letra),
  ]);
}

function teamCard(t) {
  const linhas = [];
  if (t.next) linhas.push(nextRow(t.next, t.id));
  if (t.last) linhas.push(lastRow(t.last, t.id));
  return div('cartao', [span('rotulo', t.name), ...linhas]);
}

function footer(ctx) {
  const texto = ctx.failed
    ? 'Não deu para atualizar o placar agora.'
    : ctx.updatedAt == null ? '' : `${agoLabel(ctx.updatedAt, ctx.now)} · dados ESPN`;
  return texto ? [span(ctx.failed ? 'rodape aviso' : 'rodape', texto)] : [];
}

export function describe(screen, ctx) {
  const vazio = screen.empty
    ? [div('cartao vazio', [span('mensagem', 'Nenhuma partida em andamento.')])]
    : [];
  return [
    ...screen.live.map(liveCard),
    ...vazio,
    ...screen.teams.map(teamCard),
    ...footer(ctx),
  ];
}

// Texto para o leitor de tela: uma linha por jogo ao vivo, só placar e situação.
export function announce(screen) {
  return screen.live
    .map((m) => `${m.home.name} ${pair(m.home.score, m.away.score)} ${m.away.name} · ${statusLabel(m)}`)
    .join('. ');
}

// A região viva fica num nó estável fora do #placar; só escreve se mudou.
export function updateAnnouncement(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

function build(node, doc, svg) {
  const dentro = svg || node.svg === true;
  const e = dentro ? doc.createElementNS(SVG_NS, node.tag) : doc.createElement(node.tag);
  for (const [k, v] of Object.entries(node.attrs || {})) e.setAttribute(k, v);
  if (node.text !== undefined) e.textContent = node.text;
  for (const filho of node.children || []) e.appendChild(build(filho, doc, dentro));
  return e;
}

export function render(root, nodes, doc = document) {
  root.replaceChildren(...nodes.map((n) => build(n, doc, false)));
}
