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
  histórico; o crítico nunca é barrado, porque já sai uma vez só por incidente).
- **Gravidade**: aviso é só a mensagem; crítico começa com `@all` e grava
  `mention_everyone = all`, o que gera push para todos do servidor (respeitando
  o silenciar de cada um). Crítico só onde há algo fora para todo mundo ou
  prestes a cair: CPU ≥ 95% por 10 min, memória ≥ 95% por 5 min, LiveKit fora
  por 5 min, backend reiniciando sem parar e voz sem conectar para várias
  pessoas (reconexão em massa é aviso: a voz já voltou sozinha).

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
`concord-server`), sem tocar no arquivo das unidades, e só quando o `.env` da
VPS tem `ALERTS_SERVER_ID`.

## Consequências

- **Limite conhecido**: alerta postado pelo próprio backend não avisa quando a
  VPS inteira (ou o backend, ou o banco) está fora: só depois, quando volta
  ("ficou fora de X a Y"). Avisar na hora pede um monitor externo, fora desta
  decisão.
- Volume: `alert_incidents` tem uma linha por incidente (típico: algumas por
  dia; pior caso com o teto, ~240 por canal por dia) e `backend_runs` uma por
  boot (deploys e quedas, < 50 por dia). Em 14 dias, menos de 5 mil linhas no
  pior caso e algumas centenas no normal; o backend apaga o que passa de 14
  dias. Uma avaliação por minuto lê as linhas dos últimos 3 min do
  `livekit_metrics` por regra (e da última hora, ~60 linhas, na do LiveKit
  fora), sempre pela chave primária `minute`, e conta eventos de 3 a 5 min do
  `live_events` (índice `at`).
- As sequências da histerese ficam na memória: depois de um reinício a regra
  espera o `Hold` de novo antes de avisar (e antes de normalizar).
- **Quem vê**: canal de sistema não aceita regras de permissão próprias nem
  herda a categoria, então todo membro do servidor de `ALERTS_SERVER_ID` vê os
  4 canais e recebe o push do crítico. O servidor tem de ser só dos devs. Os
  textos são técnicos (números, nomes de unidade, nenhum dado de pessoa).
- LiveKit fora há mais de 1 h vira "sem dado" (a regra só vale se ele
  respondeu na última hora): o incidente fica aberto, sem lembrete, até voltar.
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

## Emenda: parte 2 (25/11/2026) — API, VPS, erros, congelamento e resumo diário

**Contexto novo.** A VPS ficou congelada pelo provedor três vezes em três dias
(23/11 por 8h21, 24/11 desligada 16 min, 25/11 por 4h49) e ninguém foi avisado.
No congelamento a VM é pausada e retomada **sem reiniciar**: não há boot, então
`backend_down` não vê nada. Na volta o relógio do sistema fica atrasado pelo
tempo da pausa (25/11: sistema em 09:32 UTC, hardware em 14:21) até o
`systemd-timesyncd` corrigir (até 34 min). Entraram também as tabelas da API,
da VPS (ADR 0067) e dos erros do app (ADR 0068).

**Três formas, escolhidas pelo que o sinal é** (do mesmo jeito que a parte 1
separou regra e `Event`):

1. **Condição que dura** (disco, 5xx, p95, swap…): uma `Rule` num `rule_<nome>.go`,
   com a histerese do motor. Ganhou `Rule.Remind` (padrão 6 h): a capacidade
   das lives lembra a cada 7 dias.
2. **Acontecimento** (máquina congelada, erro novo): um vigia próprio que manda
   `Event` por `Engine.Notify` (mensagem + linha fechada no histórico), como o
   `DatabaseWatch`. Os vigias rodam por `Runner.Watches`.
3. **Tarefa com horário** (resumo diário): a cada minuto vê se passou das 8h de
   Brasília e se o resumo de ontem já saiu. A marca do dia fica numa tabela
   própria (`alert_daily_summaries`, migration 000220), gravada **antes** de
   postar (reinício ou dois processos no deploy não repetem) e desfeita se o
   post falha. Considerei guardar o resumo em `alert_incidents`, mas ele não é
   alerta: entraria na recorrência e no histórico do painel.

**Congelamento** (`host_frozen`, crítico, em `#alertas`). Padrões olhados: o
Proxmox detecta a pausa comparando o relógio do convidado com o do hospedeiro
e acerta pelo agente (`guest-set-time`); o kernel trata salto de
`CLOCK_REALTIME` como coisa de NTP ou de suspensão; o chrony loga "forward time
jump" ao voltar. Sem agente nem acesso ao hospedeiro, a decisão foi:

- a cada 30 s, o relógio de hardware (`/sys/class/rtc/rtc0/since_epoch`, que o
  hipervisor mantém andando) contra o do sistema: mais de 1 min de diferença =
  congelou, visto logo na volta;
- de reserva, o salto do relógio de parede sobre o monotônico entre duas
  leituras (o que sobra quando o NTP corrige, ou quando o hipervisor conta a
  pausa no monotônico): cobre máquina sem RTC legível;
- uma mensagem por congelamento: o salto do NTP com a mesma duração do já
  avisado é ignorado, e um reinício com o relógio ainda atrasado consulta o
  último `host_frozen` gravado (duração parecida, nas últimas 3 h) antes de
  avisar de novo. Relógio de hardware na hora local (`/etc/adjtime` com
  `LOCAL`) ou ausente (dev, Windows, contêiner) = sem dado; só o salto vale.
- O incidente grava início e fim estimados **na hora certa** (do relógio de
  hardware). A mensagem avisa que as mensagens saem com a hora errada até
  sincronizar e como forçar (`systemctl restart systemd-timesyncd`).

**Erro novo** (`error_new`, em `#erros`). Do Sentry: alerta no "primeiro
visto" é o padrão, mas "avisar todo erro novo" afoga o canal; o remédio deles é
limitar a frequência por regra. Aqui: uma mensagem por grupo, no máximo 5 por
hora; o que passa sai numa mensagem só ("mais N erros novos…"), no máximo uma
por hora, e o resto fica só no histórico. O cursor é o `first_seen` do último
grupo avisado (gravado no `started_at` do incidente): reiniciar não repete nem
pula, e nunca volta mais de 1 h (alertas desligados por dias não viram
enxurrada).

**Buraco na coleta** (`collector_stalled`). Do Prometheus/Grafana: o
`absent_over_time` e o "No Data" separam "a fonte parou" de "o valor está
ruim". A regra roda no próprio backend (então ele está de pé): `api_metrics`,
`host_metrics` ou `livekit_metrics` sem linha há 5 min, por 10 min seguidos,
vira aviso. Tabela vazia ou parada há mais de 24 h (coletor desligado de
propósito) não conta.

**Regras novas e limiares** (justificativa no topo de cada `rule_*.go`; tabela
em docs/OBSERVABILIDADE.md § Alertas): disco e inodes (80/90%), backup com mais
de 26 h ou com menos da metade do anterior, 5xx (5% e 25%, com 10 e 50 erros no
mínimo em 5 min), panic, p95 (2 s e 5 s com 20 pedidos no minuto), pool do banco
com fila, swap crescendo, steal ≥ 10% por 10 min, 100 erros de buffer UDP em
5 min, capacidade (pico semanal ≥ 45 Mbps, teto medido perto de 60), pico de
erro (um grupo em 5 pessoas em 15 min, crítico) e decodificador caindo para o
processador em 4 pessoas em 10 min (`#qualidade`). "Lives abaixo do alvo em
massa" não tem evento claro (é média de amostras): fica no resumo.

**Volume e custo.** Uma linha por dia em `alert_daily_summaries` (14 em 14
dias, apagadas pela retenção). As regras novas leem só a última linha ou os
últimos 5–35 min de `api_metrics`/`host_metrics` pela chave `minute`; as rotas,
os últimos 10 min de `api_route_metrics`; o pico da semana (~10 mil linhas de
`livekit_metrics`) roda uma vez por hora; o backup anterior, uma vez por dia
(quando aparece arquivo novo). Erro novo: um `SELECT` por minuto em
`app_error_groups` por `first_seen`. O resumo roda uma vez por dia. Pior caso
de `alert_incidents` com o erro novo em enxurrada: uma linha por minuto (~1 440
por dia, ~20 mil em 14 dias, ainda pequeno); o normal é de algumas por dia.

**Fontes.**

- Proxmox, *sync guest time via QGA when the clock falls behind* (resume, pausa):
  https://lore.proxmox.com/all/20260813135713.380802-1-j.klocker@proxmox.com/t/
- Thomas Gleixner sobre o que faz `CLOCK_REALTIME` saltar:
  https://lore.kernel.org/871r557jls.ffs@tglx/
- Sentry, *Issue alert configuration* (intervalo de ação por regra):
  https://docs.sentry.io/product/alerts/create-alerts/issue-alert-config
- Sentry, *Top 3 issue alert tips to stop noisy notifications*:
  https://blog.sentry.io/top-3-issue-alert-tips-to-stop-noisy-notifications
- Grafana, *Handle missing data* (`absent_over_time`, No Data):
  https://grafana.com/docs/grafana/latest/alerting/guides/missing-data/
