# 0071. Avisar falhas e limites em canais de sistema do servidor dos devs, com um motor de regras no backend

- Status: aceito
- Data: 2026-11-25
- Complementa: [0029](0029-observabilidade-das-lives.md), [0032](0032-sinais-de-qualidade-das-lives-e-calls.md), [0059](0059-tipo-do-canal-de-sistema.md)

## Contexto

Em 24/11/2026 a VPS ficou 16 minutos fora e quem percebeu foi uma pessoa. Nada
avisa: uma unidade do systemd que falha (o backup diário, a atualização do
yt-dlp) passa em silêncio, e ninguém fica sabendo de CPU ou memória no limite.
O dono pediu que os avisos caiam em canais de texto do servidor "Devs Salinha".

Forças:

- **VPS pequena** (2 vCPU, ~4 GB, dividida com Postgres, LiveKit, Caddy e o
  Maestro): nada de serviço novo (Alertmanager, Grafana), nada de dependência.
- **Sem spam**: uma mensagem ao disparar e uma ao normalizar; pico de um minuto
  não vira alerta; teto por hora.
- **Sobreviver a reinício** sem repetir o aviso (o deploy reinicia o backend).
- **Crescer por arquivo**: a parte 2 (métricas da API e da VPS, erros do app,
  resumo diário) acrescenta regras sem mexer no motor.
- **Push no celular** só para o que é grave.

## Opções consideradas

1. **Prometheus + Alertmanager (ou Grafana) na VPS.** O padrão da indústria:
   regras com `for` (pendente → disparado), `keep_firing_for`, agrupamento e
   `repeat_interval`. Mas são dois serviços novos, memória que a VPS não tem, e
   um webhook para chegar ao chat de qualquer jeito.
2. **Script do systemd/cron que lê o banco e chama a API.** Leve, mas a regra
   viraria shell, sem teste, e o script precisaria de um token de uma conta.
3. **Motor de regras dentro do backend (escolhida).** Um pacote
   `internal/alert` que avalia as regras a cada minuto lendo só as últimas
   linhas das tabelas que já existem, guarda o incidente aberto no banco e
   escreve nos canais pelo `message.Service`. Copia do Prometheus o essencial
   (estado pendente com `for`, normalizar só depois de um tempo bom,
   lembrete espaçado) e do Nagios a ideia de estado "soft" antes do "hard"
   (a condição tem de se repetir antes de avisar).

## Decisão

**Motor** (`backend/internal/alert`, ligado em `cmd/wire_alerts.go`):

- Uma regra é um valor `alert.Rule{ID, Title, Channel, Hold, Check}`; `Check`
  lê uma fonte e devolve `Reading{Level, Text}` com o nível de agora (`ok`,
  `aviso`, `critico` ou `sem dado`). Regra nova = um arquivo `rule_<nome>.go`
  com o construtor e uma linha na lista de `rules.go`.
- **Histerese no motor**: cada nível precisa se manter por `Hold.Warning` /
  `Hold.Critical` antes de postar, e o `ok` por `Hold.Clear` antes de
  normalizar. As sequências ficam na memória (um reinício recomeça a contagem,
  como o `for` do Prometheus); `sem dado` zera as sequências e não muda nada.
- **Estado no banco**: o incidente aberto (`alert_incidents` com `ended_at`
  nulo, um por regra) é o estado da regra: gravidade, desde quando, última
  mensagem. Reiniciar não repete o aviso; normalizar fecha o incidente. A mesma
  tabela é o histórico de 14 dias do painel.
- **Mensagens**: uma ao disparar, uma se agravar (aviso → crítico), uma ao
  normalizar ("normalizou, durou X"), um lembrete a cada 6 h se continuar, e no
  máximo 10 mensagens por hora por canal (o que passar só vai para o log e o
  histórico).
- **Gravidade**: aviso é só a mensagem; crítico começa com `@all` e grava
  `mention_everyone = all`, o que gera push para todos do servidor (respeitando
  o silenciar de cada um). Crítico só onde há algo fora para todo mundo ou
  prestes a cair: CPU ≥ 95% por 10 min, memória ≥ 95% por 5 min, LiveKit fora
  por 5 min, backend reiniciando sem parar e falha de voz de várias pessoas.

**Onde e quem escreve**:

- `ALERTS_SERVER_ID` (vazio = tudo desligado, o padrão de quem hospeda a
  própria Salinha). Ligado, o boot garante a categoria **Monitoramento** e os
  canais de sistema `alertas` (infra e serviços), `erros` (erros do app, parte
  2), `qualidade` (calls e lives) e `resumo-diario` (parte 2), criando só os que
  faltam. Cada canal é reconhecido pelo `system_kind` (`alert_infra`,
  `alert_errors`, `alert_quality`, `alert_daily`; migration 000215 amplia o
  CHECK da ADR 0059), então renomear ou mover não quebra nada, e `is_system`
  impede apagar sem querer. Um canal por quem age: quem cuida da VPS silencia
  `qualidade` sem perder `alertas`; os da parte 2 já nascem para não mexer no
  servidor de novo.
- A mensagem é de sistema (`system_kind = 'alert'`), assinada pelo **Salinha
  Bot**: o desktop a mostra como as outras mensagens do servidor, o celular
  com o nome e o avatar do bot, e ela não conta para badges nem XP. O push
  passa a aceitar mensagem de sistema **só** quando ela pinga todo mundo
  (`mention_everyone`), o que hoje só o alerta crítico faz.

**Regras da parte 1**: backend subiu / ficou fora (com parada limpa ×
queda, por `backend_runs.stopped_at`, gravado no SIGTERM, e a última linha do
`livekit_metrics`), reinícios em sequência, CPU e memória da máquina, LiveKit
fora e CPU do LiveKit, banco fora (avisado quando volta), falha de unidade do
systemd e falhas de voz em massa (ADR 0032). O backup que roda e não gera
arquivo fica para a parte 2 (idade do arquivo). Limiares em constantes em
cada `rule_*.go` (docs/OBSERVABILIDADE.md § Alertas).

**Falha de unidade do systemd**: `OnFailure=concord-alerta@%n.service` nas
unidades; o modelo `deploy/concord-alerta@.service` faz um `curl` para
`POST /internal/alerts/unit-failed` em `127.0.0.1:8090`. A rota fica fora de
`/api`, recusa pedido que não vem de loopback ou que traz `X-Forwarded-For`/
`Forwarded`/`X-Real-IP` (todo pedido que passa pelo Caddy traz), e o
`deploy/Caddyfile` responde 404 em `/internal/*` antes do backend. O
`scripts/deploy-vps.sh` instala o modelo e um complemento `alerta.conf` com o
`OnFailure` em cada `concord-*`/`salinha-*.service` da VPS (menos o
`concord-server`), sem tocar no arquivo das unidades.

## Consequências

- **Limite conhecido**: alerta postado pelo próprio backend não avisa quando a
  VPS inteira (ou o backend, ou o banco) está fora: só depois, quando volta
  ("ficou fora de X a Y"). Avisar na hora pede um monitor externo, fora desta
  decisão.
- Volume: `alert_incidents` tem uma linha por incidente (típico: algumas por
  dia; pior caso com o teto, ~240 por canal por dia) e `backend_runs` uma por
  boot (deploys e quedas, < 50 por dia). Em 14 dias, menos de 5 mil linhas no
  pior caso e algumas centenas no normal; o backend apaga o que passa de 14
  dias. Uma avaliação por minuto lê no máximo 11 linhas do `livekit_metrics`
  (chave primária) e conta eventos de 5 min do `live_events` (índice `at`).
- As sequências da histerese ficam na memória: depois de um reinício a regra
  espera o `Hold` de novo antes de avisar (e antes de normalizar).
- Canais de sistema não podem ser apagados pelo app; se `ALERTS_SERVER_ID`
  mudar, os canais do servidor antigo ficam lá (apagar por SQL).
- Silenciar: cada dev silencia o canal ou o servidor no app; para desligar
  uma regra para todos, `ALERTS_MUTED=<id>,<id>` no `.env`.
- Parte 2: novas regras (`rule_*.go`) sobre as tabelas das tarefas obs-servidor,
  obs-erros e obs-dispositivo, e o resumo diário em `resumo-diario`.

## Fontes

- Prometheus, *Alerting rules* (`for`, estado pendente, `keep_firing_for`):
  https://prometheus.io/docs/prometheus/3.5/configuration/alerting_rules/
- Grafana, *Alert rule state and health* (Normal, Pending, Alerting, NoData):
  https://grafana.com/docs/plugins/grafana-prometheusalerting-app/latest/fundamentals/alert-rule-evaluation/alert-rule-state-and-health/
- Nagios Core, *State types* (soft × hard, `max_check_attempts`):
  https://assets.nagios.com/downloads/nagioscore/docs/nagioscore/4/en/statetypes.html
- systemd-devel, Lennart Poettering sobre `OnFailure=unidade@%n.service`:
  https://lists.freedesktop.org/archives/systemd-devel/2014-December/025843.html
- *Notifying on failed systemd services* (modelo com `%n`, cuidado com laço):
  https://samasaur1.github.io/blog/notifying-on-failed-systemd-services
