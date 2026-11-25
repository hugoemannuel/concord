# 0067. Métricas da API por minuto e da VPS no Postgres, lidas pelo próprio backend

- Status: aceito
- Data: 2026-11-25
- Complementa: [0029](0029-observabilidade-das-lives.md) (mesmo caminho: o backend coleta a cada minuto e grava no Postgres, 14 dias)

## Contexto

Em 24/11/2026 a VPS ficou 16 minutos fora e ninguém tinha como ver nada sobre a
API ou a máquina: só as lives e calls têm histórico (`livekit_metrics`, com CPU
e memória da VPS). O dono pediu:

- métricas da API por minuto (pedidos, erros 5xx, latência), no Postgres como as
  do LiveKit, e saber **qual rota** está lenta ou dando 5xx;
- a observabilidade da VPS em si: CPU, RAM, banda, disco (e o que mais ajuda a
  entender uma queda: swap, `steal`, reinício da máquina, backup, banco).

Um agente de alertas vai ler essas tabelas depois (última linha, últimos N
minutos).

Forças: VPS pequena (2 vCPU, ~4 GB, com Postgres, LiveKit, Caddy e o Maestro);
sem serviço novo; sem dependência nova; linhas com teto; só números técnicos;
nada pode derrubar o backend numa máquina sem `/proc` (Windows em dev).

## Opções consideradas

**Como medir a API:**

1. **Prometheus (`client_golang`) + Prometheus/Grafana** (o padrão RED: contador
   de pedidos por rota e status e histograma de duração). Prós: padrão da
   indústria. Contras: dependência nova, serviço novo com armazenamento próprio
   (centenas de MB), outro painel fora do app.
2. **OpenTelemetry com exportador.** Mesmo problema, e mais peso (SDK, coletor).
3. **Middleware do gin com contadores em memória e um coletor que grava uma
   linha por minuto** (escolhida). É o RED sem o Prometheus: contadores por
   classe de status e um histograma de **baldes fixos** (1, 2, 5, 10, 25, 50,
   100, 250, 500 ms, 1, 2,5, 5, 10, 30 s, +∞) de onde saem p50/p95/p99 por
   interpolação dentro do balde, e o máximo exato. Mesmo desenho do
   `liveobs.ServerCollector`.

**Por rota (o que custa linhas):**

1. Uma linha por rota por minuto: ~300 rotas registradas, até 432 000 linhas por
   dia no pior caso. Caro demais.
2. Por minuto, só as rotas com 5xx ou entre as N mais lentas.
3. **Agregado de 5 em 5 minutos, até 20 rotas por janela** (escolhida): ordem
   por 5xx (mais primeiro) e depois pelo **tempo total gasto** na rota (soma das
   latências). O tempo total pega tanto a rota lenta e rara (1 pedido de 5 s)
   quanto a rápida e muito chamada; o 5xx garante que toda rota com erro entra.
   A linha do minuto (agregada) já dá o momento exato; a rota responde "qual".

**Máquina:**

1. **node_exporter** (lê o mesmo `/proc`). Serviço novo e precisa de um
   Prometheus para guardar.
2. **Colunas novas na `livekit_metrics`.** Mistura assuntos (o LiveKit não é a
   máquina), a tabela tem 25 colunas e o `INSERT` usa `ROW(EXCLUDED.*)` com a
   lista inteira; outra tarefa mexer nela daria conflito.
3. **Tabela nova `host_metrics`, lida do `/proc` e do `statfs` pelo backend**
   (escolhida). A `livekit_metrics` continua igual (o gráfico de CPU e memória da
   série do servidor não muda). As duas leituras de CPU usam leitores
   separados (o `/proc/stat` é acumulado e cada leitor guarda a sua leitura
   anterior).

## Decisão

**Pacotes.** `internal/platform/httpmetrics` (middleware, contadores e
histograma em memória), `internal/platform/hoststats` ampliado (só lê arquivos:
`/proc/stat`, `/proc/loadavg`, `/proc/meminfo`, `/proc/diskstats`,
`/proc/self/mountinfo`, `/proc/net/dev`, `/proc/net/route`, `/proc/net/snmp`,
`/proc/<pid>/stat` e `status`, e `statfs`), e `internal/serverobs` (coletores,
repositórios, painel e retenção), ligado em `cmd/wire_serverobs.go`.

**API (`api_metrics`, uma linha por minuto, migration 000210).** Pedidos, por
classe (2xx, 3xx, 4xx, 5xx), latência p50/p95/p99/máx, pedidos em andamento (na
coleta e o máximo do minuto), panics, WebSockets abertos e quantos entraram e
saíram no minuto, goroutines, heap em uso e `Sys` do Go, ciclos e pausa de GC
(total e maior), e o pool do Postgres (`pgxpool.Stat`: em uso, ociosas, total,
máximo, quantas esperas por conexão e quanto tempo esperaram).

- Rota é o padrão do gin (`c.FullPath()`, ex. `GET /api/channels/:id/messages`),
  nunca a URL; sem rota (404) vira `(sem rota)`, sem o método (o método de um
  pedido sem rota é texto livre do cliente).
- Fora da conta: `/healthz`, downloads longos (`/updates/*`, mídia do chat, os
  mesmos do `isLongDownload`) e upgrades de WebSocket que não são o do app
  (`/rtc` do LiveKit). O `/ws` conta como **conexão** (aberta enquanto o
  handler roda; entrou/saiu no minuto), não como pedido. Assim não foi preciso
  mexer no `Hub` (god file, 535 linhas).
- **Panics**: o middleware fica depois do `gin.Recovery`, vê o panic, conta,
  marca o pedido como 5xx e relança para o `Recovery` (que segue escrevendo no
  journal como hoje). Não há gancho no `Recovery`: o relatório de erros (ADR 0068)
  pode trocar o `Recovery` sem conflitar. `http.ErrAbortHandler` não é panic.
- O log de pedidos (`httplog`) não muda.

**Por rota (`api_route_metrics`, 5 em 5 min, até 20 rotas, migration 000210).**
Pedidos, 4xx, 5xx, p50, p95, máximo e tempo total (ms).

**VPS (`host_metrics`, uma linha por minuto, migration 000211).** CPU (uso,
`iowait`, `steal`), carga 1/5/15 min, memória usada (%), disponível (MB) e swap
usado (MB); disco da pasta de dados (usado e livre em bytes e %, inodes em %;
`OBS_DISK_PATH`, padrão a pasta de trabalho do backend, que é `/opt/concord` na
VPS); leitura/escrita por segundo e % de tempo ocupado do disco dessa pasta
(`/proc/diskstats`); rede da interface da rota padrão (`/proc/net/route`; sem
ela, a de mais tráfego, ignorando `lo`, `docker*`, `br-*`, `veth*`): bytes e
pacotes por segundo nos dois sentidos, erros e descartes; contadores UDP do
kernel (`RcvbufErrors`, `InErrors`, `SndbufErrors`) no minuto; CPU e memória
(RSS) do backend e do Postgres (processos `postgres` no `/proc`; memória =
soma da parte privada `RssAnon` + a maior parte compartilhada `RssShmem`, para
não contar o `shared_buffers` uma vez por processo); tamanho do banco e
conexões abertas; idade e tamanho do backup mais novo (`OBS_BACKUP_DIR`, padrão
`backups` relativo à pasta de trabalho = `/opt/concord/backups`); hora do boot
(`btime`). CPU de processo em % da máquina inteira, como a da VPS.

**Tabelas maiores (`db_table_sizes`, de hora em hora, as 10 maiores, migration
000211).**

**Falhas.** Cada leitura falha sozinha e vira nulo; a linha sai mesmo assim.
Sem `/proc` (Windows) a linha da VPS sai só com o que der (banco, backup).

**Painel.** `GET /api/obs/server?days=N` (1–14, padrão 7), só para devs
(`dev_badge_users`, a mesma checagem do `/api/obs/lives`), com a última linha de
cada tabela, as séries em baldes (`date_bin`, até ~300 pontos) e as rotas da
janela. Aba **Servidor** do painel, em blocos VPS, API e LiveKit.

**Leitura para alertas.** `serverobs.APIRepository.Latest`/`Recent(n)` e
`serverobs.HostRepository.Latest`/`Recent(n)`.

**Retenção.** 14 dias nas quatro tabelas, apagado de hora em hora.

## Volume

| Tabela | Por dia | Em 14 dias |
|---|---|---|
| `api_metrics` | 1 440 | 20 160 |
| `host_metrics` | 1 440 | 20 160 |
| `api_route_metrics` | até 5 760 (20 × 288) | até 80 640 |
| `db_table_sizes` | 240 (10 × 24) | 3 360 |

Linhas de ~100–300 bytes: no pior caso ~40 MB em 14 dias, na prática bem menos
(com o grupo pequeno, poucas rotas são chamadas em cada janela). Custo da
coleta: um `ReadMemStats` por minuto, a leitura de uns 10 arquivos do `/proc`,
a varredura de `/proc/*/comm` (centenas de arquivos pequenos) e 2 consultas
simples ao banco; o middleware faz um `Lock` e um incremento por pedido.

## Consequências

- Dá para responder, com histórico: a API caiu ou ficou lenta? em qual rota? o
  pool do banco esgotou? o processo vazou memória ou goroutines? a VPS reiniciou,
  ficou sem RAM (swap), sem disco, ou o vizinho tomou a CPU (`steal`)? o backup
  rodou?
- Um buraco em `api_metrics`/`host_metrics` é tempo com o backend fora (o
  coletor roda dentro dele); o `boot_at` diz se foi a máquina que reiniciou.
- Percentis vêm de baldes: o erro é no máximo o tamanho do balde (ex.: p95
  entre 100 e 250 ms). O máximo é exato.
- CPU do Postgres por processo: processo que terminou no meio do minuto perde
  o último pedaço (aproximação).
- Variáveis novas (opcionais): `OBS_DISK_PATH`, `OBS_BACKUP_DIR`.

## Fontes

- RED method (rate, errors, duration) e histogramas de duração por rota:
  https://grafana.com/docs/grafana-cloud/knowledge-graph/advanced-configuration/mapping-metrics-to-insights/request-error-and-duration-red/ ,
  https://betterstack.com/community/guides/monitoring/red-use-metrics/
- node_exporter (coletores `cpu`, `diskstats`, `netdev`, `netstat`, `filesystem`):
  https://github.com/prometheus/node_exporter
- Linux `proc(5)` (`/proc/stat`, `loadavg`, `meminfo`, `diskstats`, `net/dev`,
  `net/snmp`, `[pid]/stat`, `[pid]/status`): https://man7.org/linux/man-pages/man5/proc.5.html
  e https://www.kernel.org/doc/Documentation/ABI/testing/procfs-diskstats
- pgx v5 `pgxpool.Stat` (`EmptyAcquireCount`, `EmptyAcquireWaitTime`):
  https://pkg.go.dev/github.com/jackc/pgx/v5/pgxpool#Stat
- Go `runtime.MemStats`: https://pkg.go.dev/runtime#MemStats
