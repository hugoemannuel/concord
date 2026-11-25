# 0029. Observar as lives pelo próprio backend: Prometheus do LiveKit e telemetria do app no Postgres

- Status: aceito
- Data: 2026-10-29
- Complementa: [0020](0020-qualidade-das-lives.md) (o controlador e os painéis da live mostram o agora; isto guarda o histórico)

## Contexto

As decisões sobre as lives (codec, simulcast, TURN, tamanho da VPS) eram
tomadas no escuro: o painel "Sua transmissão/Recebendo" mostra só o momento e
só para quem abre, e o servidor não tinha métrica nenhuma (relatório da
investigação, §3.6 e §3.9). O dono pediu informação completa para "saber onde
agir": banda e CPU do servidor no tempo, e, por live, quem, quanto tempo, codec,
quanto ficou abaixo do alvo, congelamentos, placa ou processador, por que
piorou.

Forças:

- **VPS pequena** (2 vCPU, ~4 GB) dividida com backend, Postgres, LiveKit,
  Caddy e o Maestro: nada pesado; sem Prometheus + Grafana se der para evitar.
- **Sem dependência nova** (go.mod, package.json).
- **Privacidade**: só números técnicos, nada do que se fala ou mostra.
- O grupo é pequeno (dezenas de pessoas): o volume cabe folgado no Postgres.
- Recriar o LiveKit derruba as calls: a mudança na configuração dele precisa
  ser uma só e aplicada à mão (`--infra`).

## Opções consideradas

**Servidor (LiveKit):**

1. **Prometheus + Grafana** (o caminho da doc do LiveKit). Prós: painéis
   prontos. Contras: dois serviços a mais (~300–500 MB de RAM), mais uma porta e
   login para cuidar; pesado para a VPS.
2. **VictoriaMetrics/Netdata num binário só.** Mais leve que o 1, mas ainda é
   um serviço a mais, com armazenamento e painel próprios fora do app.
3. **O backend lê o `/metrics` do LiveKit a cada minuto e grava uma linha no
   Postgres** (escolhida). Um GET local de dezenas de KB por minuto; 20 160
   linhas em 14 dias. O LiveKit não expõe UDP×TCP nem "track pausada por
   congestionamento" no Prometheus (lido no código da v1.13.10,
   `pkg/telemetry/prometheus`): isso vem da telemetria do app (abaixo).

**App (quem transmite e quem assiste):**

1. **Serviço externo** (Sentry/OpenTelemetry/callstats). Dependência nova e
   dado de usuário saindo para terceiros.
2. **Webhooks/analytics do LiveKit.** Os webhooks não trazem qualidade; o
   analytics é do LiveKit Cloud.
3. **O app resume o `getStats()` (W3C webrtc-stats) e manda ao backend**
   (escolhida): reaproveita a leitura que o painel da live já faz
   (`readActiveScreenStats`), um POST a cada 20 s com todas as sessões, tabelas
   próprias com retenção.

**Visão para o time:**

1. Grafana (descartado com o 1 acima).
2. Só endpoint JSON + consultas SQL no `psql`.
3. **Endpoint JSON só para devs + página no app** (`/observabilidade`) com as
   mesmas consultas, e o documento [OBSERVABILIDADE.md](../OBSERVABILIDADE.md)
   com o SQL para o que a página não mostra (escolhida). Dev = quem está em
   `dev_badge_users` (a mesma tabela do badge Fundador).

## Decisão

**LiveKit.** `prometheus.port` (padrão 6789, `LIVEKIT_PROMETHEUS_PORT`) no
`LIVEKIT_CONFIG`; o LiveKit escuta nos `bind_addresses` (127.0.0.1, medido).
`internal/liveobs` (coletor) + `internal/platform/promtext` (leitor do formato
de texto, sem dependência) + `internal/platform/hoststats` (`/proc/stat` e
`/proc/meminfo`). A cada minuto, a diferença entre duas coletas vira uma linha
em `livekit_metrics`: bytes e pacotes entrando/saindo, retransmissões, perda
na subida (quem publica → SFU) e na descida (SFU → quem assiste), NACK, PLI,
RTT e jitter médios, nota de qualidade média, salas/participantes/tracks (vídeo
à parte), CPU e memória do LiveKit (`process_*`) e da máquina. Contador menor
que o anterior = o LiveKit reiniciou e conta do zero. LiveKit fora: a linha sai
só com a máquina (`up = false`).

**Telemetria.** `POST /api/obs/telemetry` (login de conta; visitante não
manda), até 8 sessões por pedido, corpo ≤ 32 KB, 6 pedidos por minuto por
pessoa (o app manda 3). Cada sessão tem id gerado no app (UUID), tipo
(`transmite`, `assiste`, `call`), call, de quem é a live (`assiste`), contexto
(SO, versão, app web/desktop, GPU pelo WebGL, núcleos do processador, tipo
de rede quando o navegador conta) e uma amostra: codec, placa ou processador, resolução e fps reais ×
alvo, Mbps, `qualityLimitationReason`, degrau do controlador e trocas,
camadas, reserva, perda, jitter, RTT, congelamentos (quantos e quanto tempo),
quadros descartados, quadros-chave, PLI, NACK, UDP/TCP/TURN (par ICE
escolhido) e se o servidor pausou a live. Contadores vão como diferença no
intervalo. O servidor valida tudo (tipos fixos, números com teto, textos
cortados) e é dono da sessão quem a criou. Eventos em `live_events`: início e
fim (servidor), degrau caiu/subiu, reserva ligada, codificador/decodificador
caiu para o processador, codec trocou, congelamento longo (≥ 2 s no
intervalo), pausada pelo servidor (app). Visitante sem conta não manda. Calls sem live mandam uma amostra por minuto (RTT, perda,
jitter, transporte); lives, a cada 20 s.

**Retenção**: 14 dias para tudo, apagado de hora em hora pelo backend.

**Privacidade**: ligado por padrão, sem opção de desligar, com uma frase na
seção Privacidade das configurações. São números técnicos da conexão e do
vídeo, ligados à conta para saber de quem é o problema, guardados por 14 dias
e vistos só pelos devs; nada do que se fala, escreve ou mostra sai do app. Um
interruptor exigiria preferência nova e conferência no servidor por algo que
não expõe conteúdo; se o grupo pedir, é só não mandar no app.

## Consequências

- O deploy precisa de um `scripts/deploy-vps.sh --infra` (derruba as calls)
  para o LiveKit ganhar o Prometheus; até lá as linhas saem só com a máquina.
- Dá para responder com dado: a banda da VPS acaba antes da CPU? quem
  transmite está limitado por CPU ou banda? quantos assistem decodificando no
  processador? quantos caem no TCP (vale TURN/TLS na 443?)?
- Cada pessoa em live manda ~1 KB a cada 20 s; o backend faz 3–4 escritas
  por pedido. Volume esperado: dezenas de milhares de linhas em 14 dias.
- A página do painel é só leitura e não tem link no app: os devs abrem
  `/observabilidade` (no navegador, `https://<app>/observabilidade`).
- Migrations novas: 000172 (`livekit_metrics`) e 000173 (`live_sessions`,
  `live_samples`, `live_events`).

## Emenda (2026-11-25): buracos na coleta, reinícios e o que o painel aponta

A análise dos dados de produção de 11/11 a 25/11 mostrou que o painel errava
em pontos que este ADR decidiu:

- **Queda não vira `up = false`.** O coletor roda dentro do backend: quando o
  backend ou a VPS param (8h21 em 23/11, 16 min em 24/11), não fica linha
  nenhuma, e `up = false` nunca apareceu em 14 dias. Opções olhadas: (1) tratar
  o minuto que falta como "sem coleta" no relatório, o equivalente ao `absent()`
  do Prometheus; (2) o backend gravar, ao subir, uma linha marcando o buraco
  desde a última coleta (mais escrita, mesma informação); (3) um vigia fora do
  backend (timer do systemd ou serviço de uptime), que é o único que avisa
  *durante* a queda, mas é serviço novo e é da tarefa de alertas. **Escolhido:
  (1)**: puro, sem escrita nova. Dois ou mais minutos seguidos faltando são um
  buraco (1 minuto só é o relógio da coleta); o começo do período não conta.
- **Reinício do LiveKit = `process_start_time_seconds` mudou**, o padrão do
  Prometheus (`changes(process_start_time_seconds[…])`), no lugar de adivinhar
  pela memória. Coluna nova `livekit_metrics.livekit_started_at` (migration
  000217). Volume: as mesmas 1 440 linhas por dia (20 160 em 14 dias), 8 bytes a
  mais em cada.
- **`kind="VIDEO"`**: o LiveKit publica o tipo da track em maiúsculas;
  `video_tracks_in/out` estavam 0 em todas as linhas.
- **Média de histograma** (RTT, jitter, nota) só com 3 ou mais amostras no
  minuto e até o teto possível (10 s; nota até 5). Um minuto gravou RTT de
  3 855 065 ms.
- **Piores sessões em duas listas** (lives e chamadas, cada uma com o seu teto):
  as escalas não se comparam, e nenhuma call entrava no top 15. A voz pontua
  por minutos ruins (sintetizado ≥ 3% ou perda recebida ≥ 5%), não pela média;
  a falha de acesso não é queda. A pausa do servidor sai da pontuação (o LiveKit
  com a configuração atual não pausa) e o "codificador não dá conta" passa a
  exigir fps codificado abaixo de 80% do capturado (o `codec_ms` alto na placa é
  latência de fila). As quedas e falhas da voz vêm do período inteiro, à parte
  dos 100 eventos recentes.
- O JSON de `GET /api/obs/lives` só ganhou campos (`worst_lives`,
  `worst_calls`, `call_events`, `collection_gaps`, `livekit_restarts`, e
  `people`/`*_median` nas distribuições); `worst` segue com as duas listas para o
  app de antes.

## Fontes

- LiveKit — Deployment / Prometheus (`prometheus.port`): https://docs.livekit.io/transport/self-hosting/deployment/
- LiveKit v1.13.10 `pkg/service/server.go` (Prometheus nos `bind_addresses`) e
  `pkg/telemetry/prometheus/{packets,rooms,quality,node}.go` (nomes e rótulos):
  https://github.com/livekit/livekit/tree/v1.13.10/pkg/telemetry/prometheus
- Prometheus — Exposition formats (texto): https://prometheus.io/docs/instrumenting/exposition_formats/
- W3C — Identifiers for WebRTC's Statistics API (`outbound-rtp`, `inbound-rtp`,
  `candidate-pair`, `qualityLimitationReason`, `freezeCount`): https://www.w3.org/TR/webrtc-stats/
- Linux `proc(5)` (`/proc/stat`, `/proc/meminfo`): https://man7.org/linux/man-pages/man5/proc.5.html
- MDN — `WEBGL_debug_renderer_info`: https://developer.mozilla.org/en-US/docs/Web/API/WEBGL_debug_renderer_info
- MDN — `NetworkInformation.effectiveType`: https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation/effectiveType
- Robust Perception — Alerting on crash loops with Prometheus (`changes(process_start_time_seconds)`): https://robustperception.io/alerting-on-crash-loops-with-prometheus
- awesome-prometheus-alerts — Prometheus self-monitoring (`absent(up{…})`): https://samber.github.io/awesome-prometheus-alerts/rules/basic-resource-monitoring/prometheus-self-monitoring/
