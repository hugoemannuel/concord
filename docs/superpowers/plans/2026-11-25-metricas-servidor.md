# Plano: métricas da API por minuto e da VPS

ADR: [0067](../../adr/0067-metricas-da-api-e-da-vps.md). Branch `feat/obs-metricas-servidor`.

## Tarefas (cada uma: teste primeiro, falhando pelo motivo certo)

1. **`platform/httpmetrics`**: histograma de baldes fixos (quantis por
   interpolação, máximo exato); `Recorder` com `Middleware()`, `TakeMinute()` e
   `TakeRoutes(limit)`; `/ws` como conexão; `Skip`; panic contado e relançado.
2. **`platform/hoststats`**: parsers puros (CPU com iowait/steal, loadavg,
   meminfo, diskstats + mountinfo, net/dev + net/route, net/snmp, processo
   `/proc/<pid>/stat|status`, btime); `statfs` só no Linux; `Machine` com as
   diferenças entre duas leituras. O `Reader` atual (livekit_metrics) passa a
   deixar `guest`/`guest_nice` fora do total (já estão dentro de user/nice; na
   VPS são 0, então o número não muda).
3. **Migrations 000210 (`api_metrics`, `api_route_metrics`) e 000211
   (`host_metrics`, `db_table_sizes`)**.
4. **`serverobs`**: repositórios (inserir, `Latest`, `Recent(n)`, série em
   baldes, rotas da janela, `Prune`), coletor da API (runtime, pool, recorder),
   coletor da VPS (máquina, banco, backup, tabelas de hora em hora), retenção,
   `ReportHandler` (`GET /api/obs/server`, só devs).
5. **`cmd/wire_serverobs.go`** + uma linha em `wire.go` (e o gancho de
   middlewares em `registerRoutes`).
6. **Painel**: `features/observability/server/` com hook próprio, lib pura de
   resumo e a aba `ServerTab` (blocos VPS, API, LiveKit); registro em
   `panelTabs.tsx` se já estiver na develop.
7. **Docs**: OBSERVABILIDADE.md (coletado, psql, onde agir), HOSPEDAGEM.md
   (variáveis).
8. `affected-tests pr` verde, `check-migrations`, revisão por subagente.
