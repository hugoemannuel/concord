# Plano: alertas em canais do servidor dos devs (parte 1)

ADR: [0071](../../adr/0071-alertas-em-canais-do-servidor-dos-devs.md). Branch `feat/obs-alertas`.
Migrations 000215 (tipos de canal) e 000216 (tabelas). Cada tarefa: teste primeiro.

## Backend (`backend/internal/alert`)

1. **Migrations** 000215 (`channels.system_kind` aceita `alert_infra`, `alert_errors`,
   `alert_quality`, `alert_daily`) e 000216 (`alert_incidents`, `backend_runs`).
2. **Modelo e decisão pura** (`model.go`, `decide.go`, `streak.go`): níveis, `Rule`,
   `Hold`; dada a sequência e o incidente aberto → nada / disparar / agravar /
   normalizar / lembrar. Teste por tabela.
3. **Textos** (`messages.go`): disparo, agravou, normalizou, lembrete, eventos. Teste.
4. **Repositório** (`repository.go`): incidentes (abrir, atualizar, fechar, abertos,
   histórico, retenção), `backend_runs` (boot, parada limpa, anterior, quedas em 10 min),
   fontes (últimos minutos do `livekit_metrics`, pessoas distintas com evento). Teste com
   Postgres (schema descartável, só as migrations do pacote).
5. **Poster** (`poster.go`): canal por tipo, `@all` no crítico, teto por hora por canal.
6. **Engine** (`engine.go`): avalia as regras a cada minuto, aplica a decisão, grava o
   incidente e posta. `Notify` para eventos (boot, banco, unidade).
7. **Canais** (`channels.go`): garante categoria Monitoramento e os 4 canais, idempotente.
8. **Regras** (`rule_host.go`, `rule_livekit.go`, `rule_restart.go`, `rule_calls.go`,
   `rules.go`): cada uma testada com fonte falsa.
9. **Boot e parada** (`boot.go`): grava o boot, decide o texto (limpa × queda × primeira),
   suprime quando há reinícios em sequência; `MarkStopped` no SIGTERM.
10. **Banco fora** (`dbwatch.go`): ping a cada 15 s; ao voltar, avisa de quando a quando.
11. **Unidade do systemd** (`unit_handler.go`): `POST /internal/alerts/unit-failed`, só de
    loopback e sem cabeçalho de proxy. Teste HTTP.
12. **Painel** (`report_handler.go`): `GET /api/obs/alerts?days=N`, só devs.
13. **Mensagem com @all**: `message.Service.PostSystemNotice` (arquivo novo) e o push
    aceita mensagem de sistema só com `mention_everyone`. Testes.
14. **Ligação** `cmd/wire_alerts.go` + uma linha em `wire.go`; espera da parada junto do
    `badgeDone`.

Sem refactor estrutural prévio: nenhum arquivo tocado passa de 400 linhas
(`push/notifier.go` 320, `message/service.go` intocado; o método novo vai em arquivo próprio).

## Deploy

15. `deploy/concord-alerta@.service`, `OnFailure=` em `concord-backup.service` e
    `salinha-firewall.service`, `deploy-vps.sh` instala o modelo e o complemento
    `alerta.conf` (idempotente) e o `concord-ytdlp-update.service` nasce com `OnFailure`.
    Testes em `deploy-vps.test.mjs`.
16. `deploy/Caddyfile`: `/internal/*` responde 404 no `salinha_app`; teste em
    `scripts/caddyfile-internal.test.mjs`.

## Frontend

17. Aba **Alertas** (`features/observability/alerts/`): api, hook, lib de formatação
    (testada), componente; uma entrada em `PANEL_TABS`.

## Docs

18. `docs/OBSERVABILIDADE.md` § Alertas, `docs/HOSPEDAGEM.md`, índice de ADRs.

Verificação: `affected-tests loop` a cada ciclo; no fim `affected-tests pr` verde e
`check-migrations origin/develop`; revisão por subagente.
