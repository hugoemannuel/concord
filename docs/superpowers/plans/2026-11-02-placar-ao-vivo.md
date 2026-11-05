# Plugin oficial "Placar ao vivo": plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página estática `site/plugins/placar/` que mostra os jogos do Atlético-MG e do Cruzeiro (ao vivo, próximo, último) com dados da API pública da ESPN, para ser cadastrada como plugin oficial.

**Architecture:** Módulos ES sem build:
- `espn.js` isola a ESPN e normaliza para um modelo próprio;
- `rules.js` tem as regras puras;
- `view.js` monta o DOM sem `innerHTML`;
- `app.js` faz o ciclo de atualização.

Testes com `node --test` e fixtures reais da ESPN. O `affected-tests` passa a rodar os testes do `site/`.

**Tech Stack:** JavaScript (ES2022, módulos), HTML/CSS, `node --test` (Node 24). Sem dependência nova.

**Spec:** `docs/superpowers/specs/2026-11-02-placar-ao-vivo-design.md` (e ADR `docs/adr/0057-placar-com-a-api-publica-da-espn.md`).

## Global Constraints

- **Sem dependência nova:** nada em `package.json` ou `go.mod`. Nada de mudança em `backend/`, `frontend/` nem `mobile/`.
- **Times:** Atlético-MG = ESPN `7632`, Cruzeiro = ESPN `2022`. Não há escolha de time.
- **Endpoints:**
  - `https://site.api.espn.com/apis/site/v2/sports/soccer/all/teams/{id}/schedule` (já disputados);
  - o mesmo com `?fixture=true` (próximos);
  - `https://site.api.espn.com/apis/site/v2/sports/soccer/{slug}/scoreboard` (ao vivo).
  - Slugs: `bra.1`, `bra.copa_do_brazil`, `conmebol.libertadores`, `conmebol.sudamericana`, `bra.camp.mineiro`.
- **Atualização:** 30 s com jogo em andamento, ou com jogo começando em até 15 min; senão 5 min. Pausa com `document.hidden`.
- **Fuso:** `America/Sao_Paulo`. Formatos com `Intl.DateTimeFormat('pt-BR', ...)`.
- **CSP da página (meta):** `default-src 'none'; script-src 'self'; style-src 'self'; img-src https://a.espncdn.com; connect-src https://site.api.espn.com; base-uri 'none'; form-action 'none'`.
- **Segurança do DOM:** nenhum `innerHTML`, `outerHTML` nem `insertAdjacentHTML`. Só `createElement` e `textContent`. `<img>` só com `src` começando por `https://a.espncdn.com/`.
- **Textos visíveis:** exatamente os da tabela "Textos aprovados" da spec. Qualquer `alt` ou `title` fora dela vai para o relatório como "pendente de aprovação". Exceção: o `alt` da logo é o nome do time, que é dado.
- **Visual:** escuro, cores da Salinha copiadas em variáveis CSS. Funciona de 300 px para cima. Animação desligada com `prefers-reduced-motion`.
- **Código e commits:** comentários e commits em português, convencionais. **Sem** `Co-Authored-By` nem atribuição a IA.

## Review Focus

1. **Jogo ao vivo que a agenda ainda marca como `pre`** (minuto 0, atraso da ESPN): se começa em até 15 min ou o horário já passou e não encerrou, o plugin consulta o scoreboard e usa o status de lá. Teste em `app`/`rules` (Task 5).
2. **Evento sem `competitors` completos ou sem logo** (dado faltando): normaliza sem quebrar, o time aparece sem `<img>` e o placar como `–`. Teste em `espn` (Task 2).
3. **Dois jogos ao vivo ao mesmo tempo** (um de cada time) e o clássico: dois cartões, ou um no clássico. Teste em `rules` (Task 3).
4. **Primeira carga falhando e depois voltando:** o aviso aparece e some quando volta, sem cartões duplicados. Teste em `app` (Task 5).
5. **Data perto da meia-noite UTC:** o jogo de 00:30Z vira `qua 21:30` no fuso de Brasília. Teste em `rules` (Task 3).

---

### Task 1: `affected-tests` roda os testes do `site/`

**Files:**
- Modify: `scripts/lib/affected.mjs`
  - `isScript` passa a aceitar `site/**/*.{js,mjs}`;
  - `scriptTests` mapeia `x.js` → `x.test.mjs` e `x.mjs` → `x.test.mjs`.
- Modify: `scripts/affected-tests.mjs`. Na função `full()`, `node --test` passa a receber `'scripts/**/*.test.mjs', 'site/**/*.test.mjs'`.
- Test: `scripts/lib/affected.test.mjs`

**Interfaces:** `classify(files).scripts` passa a incluir os arquivos do `site/`, e `scriptTests` passa a achar `site/detect-os.test.mjs` a partir de `site/detect-os.js`.

- [ ] **Step 1: Failing tests** em `affected.test.mjs`:
  - `classify(['site/detect-os.js', 'site/index.html']).scripts` é igual a `['site/detect-os.js']`;
  - `scriptTests(['site/detect-os.js', 'site/plugins/placar/rules.test.mjs'], exists)` devolve `['site/detect-os.test.mjs', 'site/plugins/placar/rules.test.mjs']`, com um `exists` fake.
- [ ] **Step 2:** `node --test scripts/lib/affected.test.mjs` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `node --test scripts/lib/affected.test.mjs site/detect-os.test.mjs` → PASS. Se o `detect-os.test.mjs` falhar, consertar neste commit (spec).
- [ ] **Step 5:** `git commit -m "feat(scripts): affected-tests roda os testes do site"`

### Task 2: `espn.js`, normalização e fixtures

**Files:**
- Create: `site/plugins/placar/fixtures/`, com JSONs reais salvos com `curl` e um `README.md` curto dizendo de onde veio cada um e o que foi editado à mão:
  - `schedule-7632.json` e `schedule-2022.json` (já disputados);
  - `fixture-7632.json` e `fixture-2022.json` (próximos);
  - `scoreboard-encerrado.json`: um scoreboard de campeonato com um jogo encerrado e com gols;
  - `scoreboard-ao-vivo.json`: cópia do encerrado editada à mão para `state:'in'`, `displayClock:"67'"` e `name:'STATUS_IN_PROGRESS'`;
  - `scoreboard-intervalo.json`: com `STATUS_HALFTIME`;
  - `scoreboard-penaltis.json`: um jogo decidido nos pênaltis. Procure na Copa do Brasil ou na Libertadores com `?dates=AAAAMMDD`; se não achar, edite à mão com `shootoutScore` e anote.
  - Fixtures de ida e volta: um evento de mata-mata com fase e perna. Mapeie de onde a ESPN tira isso (`competitions[0].notes`, `series`, `leg`) inspecionando o JSON real e registre no README.
- Create: `site/plugins/placar/espn.js` + `espn.test.mjs`

**Interfaces (Produces):**
- `export const TEAMS = [{ id: '7632', name: 'Atlético-MG' }, { id: '2022', name: 'Cruzeiro' }]`
- `export const LEAGUE_SLUGS`: o mapa de nome ou id da liga ESPN → slug do scoreboard (os 5 slugs).
- `export function normalizeEvent(event) → Match`. É puro e lê tanto um evento de agenda quanto um de scoreboard.
  - `Match = { id, league, leagueSlug, stage, leg, aggregate, startsAt, status, minute, home, away, goals, shootout }`.
  - `status` ∈ `scheduled|live|halftime|finished|postponed|canceled`.
  - `minute` é a string `"67'"` ou `null`.
  - `home`/`away = { id, name, logo, score }`. `score` é número ou `null`. `logo` é `null` se não começar por `https://a.espncdn.com/`.
  - `goals = [{ teamId, player, minute, ownGoal, penalty }]`. `shootout = { home, away } | null`. `aggregate = { home, away } | null`. `leg` ∈ `ida|volta|null`. `stage` é string ou `null`.
- `export async function fetchTeam(id, fetchJson) → { past: Match[], upcoming: Match[] }`. Ordena `past` por data decrescente e `upcoming` por data crescente.
- `export async function fetchLive(slug, eventId, fetchJson) → Match | null`
- `fetchJson(url) → Promise<object>` é injetado. Nos testes ele lê os fixtures; na página é `fetch(url).then(r => { if (!r.ok) throw ...; return r.json() })`.

- [ ] **Step 1: Failing tests** em `espn.test.mjs`, com os fixtures:
  - o evento ao vivo vira `status: 'live'` e `minute: "67'"`;
  - o intervalo vira `status: 'halftime'`;
  - o encerrado vira `status: 'finished'`, com os placares numéricos;
  - os gols trazem `player` e `minute`, com `ownGoal` e `penalty` certos (escolha no fixture um gol de pênalti ou contra, se houver; senão edite e anote);
  - o jogo de pênaltis tem `shootout`;
  - um evento de mata-mata tem `stage` e `leg`;
  - a volta tem `aggregate`;
  - **Review Focus 2:** um evento sem `logo` ou com logo de outro host dá `logo: null`, e um competidor sem `score` dá `score: null`, sem lançar erro;
  - `fetchTeam` com `fetchJson` fake devolve `past` em ordem decrescente e `upcoming` em ordem crescente.
- [ ] **Step 2:** `node --test site/plugins/placar/espn.test.mjs` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** O mesmo comando → PASS.
- [ ] **Step 5:** `git commit -m "feat(placar): leitura da ESPN para o modelo do plugin"`

### Task 3: `rules.js`, as regras puras da tela

**Files:** Create `site/plugins/placar/rules.js` + `rules.test.mjs`

**Interfaces:**
- Consumes: `Match` e `TEAMS` da Task 2.
- Produces:
  - `export function buildScreen(teamsData, liveById, now) → { live: Match[], teams: [{ id, name, next, last }], empty: boolean }`.
    - `teamsData` é `[{ id, name, past, upcoming }]`. `liveById` é um `Map` de id do evento → `Match` atualizado pelo scoreboard.
    - Ao vivo: qualquer `Match` com `status` `live` ou `halftime`, sem repetir pelo `id` (o clássico vira um só).
    - Um time com jogo ao vivo não entra em `teams`.
    - `next` é o primeiro de `upcoming` com status `scheduled`, `postponed` ou `canceled`. `last` é o primeiro de `past` com status `finished`.
    - `empty` é verdadeiro quando `live` está vazio.
  - `export function nextPoll(teamsData, now) → 30000 | 300000`: 30 s se há jogo `live` ou `halftime`, ou um `scheduled` com `startsAt - now <= 15 min` (inclui os que já passaram do horário e não encerraram, **Review Focus 1**). Senão, 5 min.
  - `export function liveCandidates(teamsData, now) → [{ slug, eventId }]`: os jogos a buscar no scoreboard, pela mesma regra.
  - `export function result(match, teamId) → 'V'|'E'|'D'`. Usa o `shootout` quando o placar empata e há pênaltis.
  - `export function leagueLabel(match) → string`: Brasileirão, Copa do Brasil, Libertadores, Sul-Americana, Mineiro, ou o nome da ESPN.
  - `export function stageLabel(match) → string | null`. Ex.: `"Semifinal · ida"` ou `null`.
  - `export function whenLabel(iso) → string`: `"sáb 18:30"`, dia em 3 letras minúsculas sem ponto, em `America/Sao_Paulo`.
  - `export function agoLabel(updatedAt, now) → string`: `"Atualizado há 20 s"` abaixo de 60 s, `"Atualizado há 3 min"` acima.
  - `export function statusLabel(match) → string`: `"AO VIVO 67'"`, `"AO VIVO Intervalo"`, `"Encerrado"`, `"Adiado"`, `"Cancelado"`.

- [ ] **Step 1: Failing tests** em `rules.test.mjs`, com objetos `Match` montados no teste:
  - clássico ao vivo → `live.length === 1` e `teams.length === 0`;
  - **Review Focus 3:** dois jogos ao vivo de times diferentes → 2 em `live` e 0 em `teams`;
  - só o Galo ao vivo → `teams` só com o Cruzeiro;
  - sem ao vivo → `empty === true` e os 2 times com `next` e `last`;
  - `nextPoll`: ao vivo → 30000; jogo daqui a 10 min → 30000; jogo daqui a 2 h → 300000;
  - **Review Focus 1:** jogo `scheduled` com horário 5 min no passado → 30000, e aparece em `liveCandidates`;
  - `result`: 2×0 → V, 1×1 → E, 0×1 → D, 1×1 com pênaltis 4×3 a favor → V;
  - `leagueLabel` de um nome desconhecido devolve o nome da ESPN;
  - **Review Focus 5:** `whenLabel('2026-11-05T00:30:00Z')` é `'qua 21:30'`;
  - `agoLabel` com 20 s → `'Atualizado há 20 s'` e com 190 s → `'Atualizado há 3 min'`;
  - `stageLabel` de ida → `'Semifinal · ida'`.
- [ ] **Step 2:** `node --test site/plugins/placar/rules.test.mjs` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** O mesmo comando → PASS.
- [ ] **Step 5:** `git commit -m "feat(placar): regras do que o placar mostra"`

### Task 4: `view.js`, `index.html` e `placar.css`

**Files:** Create `site/plugins/placar/index.html`, `placar.css`, `view.js` + `view.test.mjs`

**Interfaces:**
- Consumes: `buildScreen` e os rótulos da Task 3.
- Produces:
  - `export function describe(screen, ctx) → Node[]`. Monta uma árvore de dados `{ tag, attrs, text, children }`, pura e testável sem DOM.
    - `ctx = { now, updatedAt, failed }`.
    - Os cartões seguem o rascunho aprovado (estados A, B e C): o cartão ao vivo com `aria-live="polite"`, linha de campeonato e fase, selo, logos, placar, `Agregado x × y` e a linha de gols.
    - `Nenhuma partida em andamento.` quando `empty`.
    - Um cartão por time com `Próximo: ...` e `Último: ...`.
    - Rodapé `Atualizado há ... · dados ESPN`, ou `Não deu para atualizar o placar agora.` quando `failed`.
  - `export function render(root, nodes, doc = document)`: materializa a árvore só com `createElement`, `setAttribute` e `textContent`, trocando o conteúdo de `root`.
  - **Proibido:** `<img>` cujo `src` não comece por `https://a.espncdn.com/`. O `describe` não gera essa imagem.
- `index.html`: tem a CSP das Global Constraints, `<main id="placar">`, `<link rel="stylesheet" href="placar.css">` e `<script type="module" src="app.js">`. `lang="pt-BR"`, `<meta name="viewport">`.
- `placar.css`:
  - variáveis com as cores do rascunho (fundo `#1e1f22`, cartão `#2b2d31`, texto `#dbdee1`, apagado `#949ba4`, vermelho ao vivo `#f23f42`, verde `#23a55a`);
  - `overscroll-behavior: contain`, `min-width: 0` e `text-overflow: ellipsis` nos nomes, placar com `white-space: nowrap`;
  - `@media (prefers-reduced-motion: reduce)` desliga o pulso.
- Ícone de gol: um SVG inline criado pelo `render` (bola simples, `aria-hidden="true"`), sem emoji.

- [ ] **Step 1: Failing tests** em `view.test.mjs`:
  - **Estado A**, com uma tela montada pelas fixtures da Task 2 e o `buildScreen` da Task 3: os textos `AO VIVO 67'`, o placar e um gol com `(pên.)`;
  - **Estado B:** `Nenhuma partida em andamento.`, `Próximo: x Grêmio (casa) · sáb 18:30 · Brasileirão` (monte o `Match` para dar exatamente isso) e `Último: 2 × 0 Vasco · V`;
  - **Estado C (clássico):** um único cartão;
  - `failed` mostra `Não deu para atualizar o placar agora.` e mantém os cartões;
  - um time com logo `null` não gera nó `img`;
  - um teste de `render` com um `doc` fake mínimo feito no próprio teste (`createElement` e `createElementNS` que guardam filhos e atributos), conferindo que nenhum `innerHTML` é escrito. O fake lança erro se alguém atribuir `innerHTML`;
  - um teste que lê os fontes `view.js` e `app.js` e falha se acharem `innerHTML`, `outerHTML` ou `insertAdjacentHTML`;
  - um teste que lê o `index.html` e confere a CSP exata.
- [ ] **Step 2:** `node --test site/plugins/placar/view.test.mjs` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** O mesmo comando → PASS.
- [ ] **Step 5:** `git commit -m "feat(placar): tela do placar ao vivo"`

### Task 5: `app.js`, o ciclo de atualização

**Files:** Create `site/plugins/placar/app.js` + `app.test.mjs`

**Interfaces:**
- Consumes: Tasks 2, 3 e 4.
- Produces: `export function startPlacar({ root, fetchJson, now, setTimeout, clearTimeout, setInterval, doc }) → { stop }`. Tudo é injetado para teste. No fim do arquivo, chama `startPlacar` com os globais do navegador, só se `typeof document !== 'undefined'`.
- O ciclo:
  - `fetchTeam` dos 2 times;
  - `liveCandidates` → `fetchLive` de cada um;
  - `buildScreen` → `describe` → `render`;
  - agenda o próximo ciclo com `nextPoll`;
  - um `setInterval` de 1 s só re-renderiza o rodapé (`agoLabel`), sem novo pedido.
- **Falha:** mantém a última tela e liga `failed`. Na primeira carga sem dados, a tela tem só o aviso. O próximo ciclo segue o mesmo intervalo; com tela vazia, 30 s.
- `visibilitychange`: escondido cancela o timer; visível de novo roda o ciclo na hora.

- [ ] **Step 1: Failing tests** em `app.test.mjs`, com timers e `fetchJson` fakes e `doc` fake:
  - o primeiro ciclo renderiza com os fixtures e agenda 300000 quando não há ao vivo, ou 30000 com o fixture ao vivo;
  - com o fixture ao vivo, `fetchLive` é chamado com o slug e o id certos;
  - **Review Focus 4:** a primeira carga falha → só o aviso; o ciclo seguinte dá certo → os cartões aparecem uma vez e o aviso some;
  - uma falha depois de sucesso mantém os cartões e mostra o aviso;
  - `document.hidden = true` mais o evento cancela o timer, e voltar visível roda o ciclo na hora;
  - `stop()` limpa os timers.
- [ ] **Step 2:** `node --test site/plugins/placar/app.test.mjs` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `node --test site/plugins/placar/` → PASS.
- [ ] **Step 5:** `git commit -m "feat(placar): atualização automática do placar"`

### Task 6: Documentação, verificação de ponta a ponta e pré-PR

**Files:**
- Modify: `docs/HOSPEDAGEM.md`. Uma seção curta, "Plugin oficial Placar ao vivo", depois da seção do Maestro:
  - a página sai no deploy em `https://<domínio do site>/plugins/placar/`;
  - como cadastrar pela API: `POST /api/plugins` com nome e descrição dos textos aprovados e esse `panel_url`, depois `PATCH /api/plugins/:id/review` `{"status":"approved"}` por alguém de `TECH_TEAM_USER_IDS`;
  - depende da base de plugins (PR #514).
- Modify: `docs/adr/README.md` (índice com a 0057) e o ADR 0057 para `Status: aceito` no fim.

- [ ] **Step 1:** Servir o `site/` localmente (`npx --yes http-server site -p 5300`, ou `python -m http.server 5300 -d site`). Num Playwright (o `frontend/node_modules/playwright` já existe), abrir uma página host com `<iframe sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox" src="http://localhost:5300/plugins/placar/">` em 300, 360 e 400 px.
  - **Conferir:** os dados reais carregam, o console não tem erro de CSP e o "Atualizado há" conta.
  - **Falha:** bloquear `site.api.espn.com` (`page.route`) → o aviso aparece; desbloquear → some.
  - **Ao vivo:** sem jogo real no dia, servir os fixtures ao vivo via `page.route` e ver o estado A.
  - Salvar capturas em `.superpowers/e2e/placar/`.
- [ ] **Step 2:** `node scripts/affected-tests.mjs pr` → verde, a menos das falhas que já existem na `develop` e não dependem desta branch. Liste-as.
- [ ] **Step 3:** Commit dos docs: `git commit -m "docs(placar): cadastro do plugin oficial e ADR 0057"`.
