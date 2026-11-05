# Fixtures da ESPN

JSONs reais da API pública da ESPN, salvos em 2026-11-02 com `curl` e **enxugados**: tiramos os campos
`links`, `record`, `venue`, `broadcasts`, `uid`, `$ref`, `form` e `attendance`, e deixamos só alguns eventos
por arquivo. O resto é o que a ESPN devolveu.

Base: `https://site.api.espn.com/apis/site/v2/sports/soccer`

| Arquivo | Origem | Edição à mão |
|---|---|---|
| `schedule-7632.json` | `/all/teams/7632/schedule` | só 5 eventos (semifinal da Copa do Brasil, pênaltis da Sul-Americana, quartas da Copa do Brasil, um do Brasileirão, um do Mineiro) |
| `schedule-2022.json` | `/all/teams/2022/schedule` | só 2 eventos |
| `fixture-7632.json` | `/all/teams/7632/schedule?fixture=true` | só os 3 primeiros eventos |
| `fixture-2022.json` | `/all/teams/2022/schedule?fixture=true` | só os 3 primeiros eventos |
| `scoreboard-encerrado.json` | `/bra.copa_do_brazil/scoreboard?dates=20260901` (evento 401909112, volta das quartas, clássico, com gol de pênalti) | `leagues` reduzido a `id/name/slug`; em `details` ficaram só os lances de gol |
| `scoreboard-penaltis.json` | `/conmebol.sudamericana/scoreboard?dates=20260916` (evento 401913071, decidido nos pênaltis, com gol contra) | igual ao anterior |
| `scoreboard-ao-vivo.json` | cópia do encerrado | **editado à mão** (abaixo) |
| `scoreboard-intervalo.json` | cópia do encerrado | **editado à mão** (abaixo) |

Não havia jogo ao vivo no dia, então os dois últimos foram fabricados a partir do encerrado
(`/tmp`-script descartável, resultado versionado aqui):

- `status`: `ao-vivo` com `type.name: STATUS_IN_PROGRESS`, `state: "in"`, `displayClock: "67'"`;
  `intervalo` com `STATUS_HALFTIME`, `state: "in"`, `displayClock: "45'"`. Nos dois `completed: false`.
- `details`: só os gols até o minuto do status (ao vivo e no intervalo: o pênalti do Kaio Jorge, aos 30').
- `score`: recalculado pelos gols que sobraram (0 x 1).
- `aggregateScore` (nos competidores e em `series.competitors`): 1 + gols do jogo. A ida terminou 1 x 1,
  então o agregado parcial é 1 x 2. `winner` virou `false` e `series.completed` virou `false`.
- `notes`: trocadas por `2nd Leg` (sem o texto do vencedor).

Não vimos como a ESPN preenche `aggregateScore` num jogo de volta de verdade ao vivo; a edição assume que
ela vem somando o placar parcial.

## Como a ESPN diz fase, perna e agregado

| Dado | Agenda (`.../teams/{id}/schedule`) | Scoreboard (`.../{slug}/scoreboard`) |
|---|---|---|
| Fase | `seasonType.name` (`Semifinals`, `Quarterfinals`, `Round of 16`, `Group Stage`, `Fifth Round`, `Final`). No pontos corridos vem o nome da temporada (`2026 Brasileiro Serie A `), que o plugin ignora | `competitions[0].series.title` (só em mata-mata) |
| Perna | `competitions[0].leg` = `{ value: 1 \| 2, displayValue: '1st Leg' \| '2nd Leg' }`; também em `notes[].headline` (`1st Leg`, `2nd Leg - ...`) | igual |
| Agregado | `competitors[].score.aggregateScore` (dentro do objeto `score`) depois da volta; antes dela, só na nota: `2nd Leg - Grêmio lead 2-0 on aggregate` | `competitors[].aggregateScore` e `series.competitors[].aggregateScore`; na ida vem `undefined` |
| Pênaltis | `competitors[].score.shootoutScore` e status `STATUS_FINAL_PEN` | `competitors[].shootoutScore` |
| Gols | não vêm | `competitions[0].details[]` com `scoringPlay`, `penaltyKick`, `ownGoal`, `shootout` e `athletesInvolved[0]`. O `team.id` do gol contra é o do time que ganhou o gol |
| Liga | `event.league` (`id`, `name`, `slug`) | `leagues[0]` da resposta (o evento não traz) |
| Logo | `team.logos[].href` | `team.logo` |
| Placar | `score.value` (número) | `score` (texto: `"2"`) |
