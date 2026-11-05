# Plugin oficial "Placar ao vivo" (Atlético-MG e Cruzeiro)

- Data: 2026-11-02
- Origem: issue #480 (proposta da comunidade, 78% a favor). Fecha a issue.
- Depende de: PR #514 (base de plugins, spec `2026-11-02-plugins-base-design.md`, ADR 0049) **só para o
  cadastro em produção**. O código desta spec não usa nada do #514 e pode ser feito em paralelo.
- ADR: [0057. Placar com a API pública da ESPN, direto do navegador](../../adr/0057-placar-com-a-api-publica-da-espn.md)

## Objetivo

O primeiro plugin oficial do time: um painel compacto com os jogos do **Atlético-MG** e do **Cruzeiro**:
- placar ao vivo, com minuto e gols;
- quando não há jogo, o próximo jogo e o último resultado de cada time.

Ele é uma página estática hospedada na VPS da Salinha e mostrada pelo sistema de plugins (iframe isolado)
como qualquer plugin de terceiros. Assim ele também prova a plataforma.

Critérios da #480 que precisam valer:
- logos dos times e placar da partida;
- atualização automática durante os jogos;
- indicador discreto de jogo ao vivo;
- interface compacta e sem informação desnecessária;
- mensagem simples quando não houver partida em andamento.

(O botão com ícone na barra, ao lado dos pinados, já vem do #514.)

## Decisões (e o porquê)

| Decisão | Por quê |
|---|---|
| Só Atlético-MG (ESPN `7632`) e Cruzeiro (ESPN `2022`), fixos | Escopo pedido pelo usuário. A escolha de time por pessoa exigiria uma ponte de armazenamento na plataforma (fica para outra entrega) |
| Nome do plugin "Placar ao vivo" | Pedido do usuário |
| **Abordagem A**: página estática que busca os dados na ESPN direto do navegador, sem backend | Escolhida pelo usuário. Zero mudança no backend da Salinha, plugin desacoplado como um de terceiros. A ESPN responde com `Access-Control-Allow-Origin: *` e cache de 10 s na CDN |
| Fonte: API pública e sem chave da ESPN (`site.api.espn.com`) | A única grátis que cobre todos os campeonatos dos dois times (Série A, Copa do Brasil, Libertadores, Sul-Americana, Mineiro) e tem minuto e gols ao vivo. API-Football grátis: 100 pedidos/dia. football-data.org grátis: placar atrasado e sem Copa do Brasil/Mineiro |
| Hospedagem: `site/plugins/placar/`, publicado em `https://salinha.bhrx.com.br/plugins/placar/` | O `deploy-vps.sh` já copia o `site/` inteiro para `/opt/concord/site`. O domínio do app manda `X-Frame-Options DENY` e não pode ser usado; o do site não manda |
| JavaScript puro (módulos ES), sem build e sem framework, testes com `node --test` | O `site/` já é assim (`detect-os.js` + `detect-os.test.mjs`). Sem dependência nova |
| Atualização a cada 30 s com jogo ao vivo e a cada 5 min sem; pausa com a aba escondida (`visibilitychange`) | Rápido o bastante para um placar, leve para a ESPN |
| Visual escuro fixo, no estilo da Salinha | O plugin não recebe o tema da Salinha (ADR 0049) |
| Cadastro da ficha em produção feito à mão pela API, por alguém do time, depois do deploy | Ainda não existe a tela da loja (spec 2), e uma migration com a URL fixa apareceria também para quem hospeda a própria Salinha |

## Abordagens consideradas

1. **Página estática buscando na ESPN pelo navegador (escolhida).** Simples, sem backend, plugin desacoplado.
   Se a ESPN mudar o formato ou bloquear, cada painel mostra o aviso de falha até sair uma versão nova.
2. **Página mais um endpoint no backend com cache.** Uma consulta para todos e troca de fonte sem mexer na
   página, mas amarra um plugin "de fora" no monólito. Com o número de usuários atual, o cache central não
   faz diferença.
3. **Serviço próprio do plugin num subdomínio.** Pede DNS, certificado e mais um serviço por um placar.

## Comportamento

### Dados (ESPN)

- `GET https://site.api.espn.com/apis/site/v2/sports/soccer/all/teams/{id}/schedule`: jogos já
  disputados da temporada (último resultado).
- `GET https://site.api.espn.com/apis/site/v2/sports/soccer/all/teams/{id}/schedule?fixture=true`: próximos
  jogos.
- **Ao vivo (decisão minha):** a agenda serve para próximo/último e para descobrir o jogo do dia. Quando
  um jogo de um dos times está em andamento, ou começa em até 15 min, o plugin busca a cada 30 s o placar
  do campeonato desse jogo em `.../soccer/{slug}/scoreboard` e pega o evento pelo id. O minuto e os gols
  vêm daí, porque a agenda do time pode atrasar.
  - Slugs conferidos: `bra.1`, `bra.copa_do_brazil`, `conmebol.libertadores`, `conmebol.sudamericana`,
    `bra.camp.mineiro`.
  - Se o slug do jogo não vier na agenda ou não estiver no mapa, o plugin usa o próprio evento da agenda
    (`state === 'in'`).
  - **Corte de 6 h:** um jogo `scheduled` que passou mais de 6 h do horário de início deixa de manter o
    intervalo de 30 s (evita polling eterno com dado ruim); nesse caso a atualização volta a 5 min.
  - Assim são 2 pedidos de agenda por time a cada 5 min, mais 1 scoreboard a cada 30 s só enquanto houver
    jogo.
- **Fim do jogo (decisão minha):** quando o status vira encerrado, o jogo sai do ao vivo na hora e passa a
  ser o "último" do time.
- Todo o acesso à ESPN fica num módulo só (`espn.js`), que devolve um modelo próprio do plugin (abaixo). O
  resto não conhece o formato da ESPN.

### Modelo interno (o que a tela usa)

`{ live: Match[], teams: [{ id, name, next: Match|null, last: Match|null }], updatedAt }`, onde:
- `Match = { id, league, stage?, leg?, aggregate?, startsAt, status, minute?, home, away, goals[], shootout? }`
  (`stage` = fase, ex. `Semifinal`; `leg` = `ida` | `volta`; `aggregate` = `{ home, away }` só na volta);
- `home`/`away = { id, name, logo, score? }`;
- `goals = [{ teamId, player, minute, ownGoal, penalty }]`;
- `status` é um de `scheduled | live | halftime | finished | postponed | canceled`.

### Regras da tela

- **Ao vivo:** um cartão por jogo em andamento dos dois times, com:
  - campeonato e fase quando houver, ex. `Copa do Brasil · Semifinal · ida` (a ESPN não traz número de rodada, então o Brasileirão mostra só o campeonato);
  - no jogo de volta, `Agregado 3 × 2` embaixo do placar;
  - o selo `AO VIVO 67'` ou `AO VIVO Intervalo`, com o ponto pulsando de leve (sem animação se
    `prefers-reduced-motion`);
  - as duas logos e o placar;
  - os gols de cada lado, com autor e minuto, `(contra)` e `(pên.)`;
  - na decisão por pênaltis, `pên. 4 × 3`.
- **Clássico** (Atlético-MG × Cruzeiro): um cartão só (sem duplicar pelo id do evento). Os cartões de
  próximo/último dos dois times somem juntos.
- **Sem jogo ao vivo:**
  - `Nenhuma partida em andamento.` no topo;
  - um cartão por time com `Próximo: x {adversário} ({casa|fora}) · {dia 3 letras} {HH:mm} · {campeonato}`
    e `Último: {gols do time} × {gols do adversário} {adversário} · V|E|D`.
  - Decidido nos pênaltis (decisão minha): `Último: 1 × 1 Vasco (pên. 4 × 3) · V`. V ou D segue o
    resultado dos pênaltis.
- **Time com jogo ao vivo:** o cartão dele de próximo/último some (o jogo já está em cima). O outro time
  continua com o cartão dele.
- **Sem próximo ou sem último** (ex.: fim de temporada): a linha correspondente não aparece.
- **Datas e horas:** `Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' })`.
- **Rodapé:** `Atualizado há {n} s` / `há {n} min` · `dados ESPN`, recontado a cada segundo sem novo
  pedido.
- **Falha ao atualizar:** mantém os últimos dados e troca o rodapé por `Não deu para atualizar o placar
  agora.` até a próxima tentativa dar certo.
  - Na primeira carga sem dados, mostra só o aviso, e tenta de novo no intervalo normal.
- **Nomes dos campeonatos:** mapa do nome ou slug da ESPN → `Brasileirão`, `Copa do Brasil`,
  `Libertadores`, `Sul-Americana`, `Mineiro`. Fora do mapa, usa o nome da ESPN.
- **Status:** `Encerrado`, `Adiado`, `Cancelado` (os dois últimos aparecem no lugar do placar no
  "próximo").
- **Acessibilidade:**
  - o anúncio para leitor de tela usa o nó estável `#anuncio` (`aria-live="polite"`, fora do `#placar`), atualizado a cada ciclo só com o placar e o status; o cartão em si não é região viva;
  - as logos têm `alt` com o nome do time;
  - o ponto pulsante é decorativo (`aria-hidden`);
  - contraste no padrão da Salinha;
  - nada depende de hover.

### Layout e responsivo

- **Tamanho do painel:** cerca de 360 × 400 px no desktop, largura total × ~65% da altura no celular
  (folha de baixo do #514).
- A página ocupa 100% do iframe, com rolagem vertical própria (`overscroll-behavior: contain`), em uma
  coluna.
- Funciona de 300 px de largura para cima. Nomes longos truncam com reticências, e o placar nunca quebra.
- Rascunho aprovado: `.superpowers/brainstorm/placar-estados.html` (local, fora do git) (estados A, B e C).
  O `⚽` do rascunho vira um ícone SVG inline.

### Segurança da página

- `<meta http-equiv="Content-Security-Policy">` com:
  - `default-src 'none'`, `script-src 'self'` e `style-src 'self'`;
  - `img-src https://a.espncdn.com`, `connect-src https://site.api.espn.com`;
  - `base-uri 'none'` e `form-action 'none'`.
- Nenhum `innerHTML` com dado da ESPN: só `textContent` e criação de elementos (o dado vem de fora).
- Logos só de `https://a.espncdn.com/`. URL fora disso não vira `<img>` (o time aparece sem logo).

## Textos aprovados

| Onde | Texto |
|---|---|
| Nome do plugin (ficha) | Placar ao vivo |
| Descrição (ficha) | Jogos do Atlético-MG e do Cruzeiro, ao vivo |
| Selo ao vivo | AO VIVO 67' · AO VIVO Intervalo |
| Sem jogo | Nenhuma partida em andamento. |
| Próximo | Próximo: x Grêmio (casa) · sáb 18:30 · Brasileirão |
| Último | Último: 2 × 0 Vasco · V / E / D |
| Marcas nos gols | (contra) · (pên.) · pên. 4 × 3 |
| Rodapé | Atualizado há 20 s · dados ESPN |
| Falha | Não deu para atualizar o placar agora. |
| Status | Encerrado · Adiado · Cancelado |
| Campeonatos | Brasileirão · Copa do Brasil · Libertadores · Sul-Americana · Mineiro |
| Casa/fora | casa · fora |
| Fase e agregado | Copa do Brasil · Semifinal · ida · volta · Agregado 3 × 2 |
| Nomes de fase (traduzidos no `espn.js`) (pendente de aprovação) | Final · Semifinal · Quartas de final · Oitavas de final · 16 avos de final · Fase de grupos · Primeira fase · Segunda fase · Terceira fase · Quarta fase · Quinta fase |

Qualquer outro texto visível (incluindo `alt` e `title`) precisa de aprovação antes do commit.

## Arquitetura (arquivos)

- `site/plugins/placar/index.html`: estrutura e CSP. Carrega `app.js` como módulo.
- `site/plugins/placar/placar.css`: estilo escuro com as cores da Salinha copiadas em variáveis CSS (o
  plugin não acessa os tokens do app).
- `site/plugins/placar/espn.js`: busca e normalização para o modelo interno. Funções puras de
  normalização, separadas do `fetch`.
- `site/plugins/placar/rules.js`: regras puras (ao vivo, clássico sem duplicar, próximo/último por time,
  V/E/D, nomes de campeonato, intervalo de atualização, texto do "Atualizado há").
- `site/plugins/placar/view.js`: monta o DOM a partir do modelo (sem `innerHTML`).
- `site/plugins/placar/app.js`: ciclo de atualização (`setTimeout` com 30 s ou 5 min, `visibilitychange`,
  falha mantendo os dados).
- Testes ao lado (`*.test.mjs`, `node --test`), com JSONs reais da ESPN salvos em
  `site/plugins/placar/fixtures/`: um jogo ao vivo com gols, um no intervalo, um encerrado com pênaltis, a
  agenda dos dois times e um clássico.
- `scripts/affected-tests.mjs`: hoje roda só `scripts/**/*.test.mjs` no Node. Precisa passar a rodar
  também `site/**/*.test.mjs` (incluindo o `detect-os.test.mjs`, que já existe e não roda), com o teste do
  próprio script atualizado. Se o `detect-os.test.mjs` estiver quebrado, o conserto entra neste PR
  (decisão minha).
- **Sem mudança** em `backend/`, `frontend/` nem `mobile/`; no `deploy/Caddyfile` só a exceção de `/plugins/*` com CORS. Se o Cloudflare do
  `salinha.bhrx.com.br` mandar algum cabeçalho que impeça o iframe, isso aparece na verificação e vira
  ajuste no Caddy, no mesmo PR.
- `docs/HOSPEDAGEM.md` (ou o doc de plugins que existir): um parágrafo de como cadastrar o placar depois do
  deploy (os comandos `POST /api/plugins` e `PATCH .../review` com o `panel_url` de produção). Quem
  hospeda a própria Salinha usa o próprio domínio do site.

## Fora de escopo

- Escolha de time por pessoa (e a ponte de armazenamento na plataforma).
- Outros times, classificação, cartões, escalação, estatísticas, notificação de gol.
- Endpoint no backend, cache central, outra fonte de dados de reserva.
- Tema claro e seguir o tema da Salinha.
- App Android.
- A loja e a tela de publicação (spec 2).

## Testes

- `node --test site/plugins/placar/*.test.mjs` com os fixtures:
  - normalização de cada fixture para o modelo interno: status, minuto, gols com contra e pênalti, decisão
    por pênaltis;
  - regras: clássico em um cartão, o cartão próximo/último some no time ao vivo, V/E/D, nome do campeonato
    com fallback, intervalo (30 s ao vivo, 5 min sem), texto "Atualizado há";
  - a view (com um DOM mínimo feito à mão no teste, ou só a função que gera a árvore de dados da view):
    nenhum caminho usa `innerHTML`, e uma logo fora de `a.espncdn.com` não vira `<img>`;
  - formatação de data no fuso de Brasília (um horário UTC conhecido vira `sáb 18:30`).
- `scripts/affected-tests.mjs`: teste de que os `site/**/*.test.mjs` entram na lista.

## Verificação de ponta a ponta

1. Servir `site/` localmente (`npx serve site` ou `python -m http.server` dentro de `site/`). Abrir
   `/plugins/placar/` direto: os dados reais da ESPN aparecem, sem erro de CSP no console.
2. Com o backend do #514 rodando localmente, cadastrar a ficha apontando para a URL local `https` (ou
   testar a página dentro de um iframe com o mesmo `sandbox` do #514). Conferir que o painel abre e carrega
   (ESPN responde ao `Origin: null`).
3. Num dia com jogo de um dos dois times, conferir o ao vivo (minuto e gols mudando em até ~30 s). Sem
   jogo no dia, conferir o estado ao vivo pelos fixtures num servidor de teste.
4. Simular a falha (bloquear `site.api.espn.com` no DevTools): os dados ficam e o aviso aparece. Ao
   desbloquear, ele some.
5. Conferir em 300, 360 e 400 px de largura do iframe.
6. Depois do merge e do deploy: aplicar o Caddyfile na VPS (`scripts/apply-caddyfile.sh root@IP deploy/Caddyfile`, sem ninguém em chamada) e conferir o cabeçalho com `curl -sI https://salinha.bhrx.com.br/plugins/placar/app.js | grep -i access-control-allow-origin`; só então abrir `https://salinha.bhrx.com.br/plugins/placar/`, cadastrar a ficha em
   produção pela API, aprovar, instalar num servidor e ligar.
