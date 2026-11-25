# Plano: telemetria das calls e lives no app Android

ADR: [0070](../../adr/0070-telemetria-de-calls-e-lives-no-android.md). Branch `feat/obs-telemetria-mobile`.

## Backend (`internal/liveobs`, migration 000214)

1. Teste: `Report.Validate` aceita `target` só `desktop`/`web`/`android`, corta `device`,
   aceita os eventos `segundo_plano`, `primeiro_plano`, `rede_trocou`, `rota_do_audio`.
   Código: `telemetry_model.go` (campo `Device`, constantes), `telemetry_validate.go`.
2. Teste de banco: `SaveAll` grava `device`. Migration `000214_live_sessions_device`.
   `telemetry_repository.go`.
3. Teste: `breakdowns` agrupa por `target`, `network` e `device` (com as calls; `device` sem os
   vazios). `SessionStats` com `Network`, `Device`, `Backgrounds`, `NetworkChanges`
   (`report_repository.go`: colunas e contagens de eventos).
4. Teste: motivos "Caiu com o app em segundo plano" e "Caiu ao trocar de rede"
   (`report_mobile.go`, entram em `allRules`).

## Mobile (`mobile/src/features/observability/`)

5. Cópia adaptada, com os testes: `telemetryTypes`, `statsFormat` (Android: MediaCodec `c2.*`/
   `OMX.*` na placa; `c2.android.*`/`OMX.google.*` no processador), `telemetrySample` (sem
   degrau, reserva, motivo do codec), `telemetryCall`, `telemetryEvents`, `callStatsReport`.
6. `telemetryContext`: Android + versão, versão do app, `android`, fabricante e modelo, rede do
   NetInfo.
7. `callEventLog` (eventos com hora, até 8 e 5 min) + `telemetryConnection` (fases do
   `callSessionStore` → `connect_ms`, `reconectou`) + `connectionProbe` (decora API e mídia:
   `conexao_falhou` por etapa; queda em call).
8. `deviceSignals`: segundo plano/primeiro plano, troca de rede, rota do áudio (inferida).
9. `telemetryReporter` (cópia adaptada): sessões; eventos do log na amostra da voz; falha sem
   sessão vira uma sessão de voz só com os eventos.
10. `hooks/useCallTelemetry`: timer de 20 s só com call em andamento; última leitura ao sair.
    Registro na `_layout.tsx` (uma linha).

## Call (mobile) — o mínimo

11. `call/lib/callStatsSource.ts` (registro da leitura, puro) e `call/lib/livekitStats.ts` (SDK);
    `livekitMedia.ts` registra ao conectar e limpa ao sair; `callRuntime.ts` decora API e mídia.

## Painel (frontend)

12. Depois do rebase: distribuições "Plataforma", "Rede", "Aparelho" e, nas piores sessões, a
    plataforma, o aparelho e a rede ao lado do sistema.

## Docs

13. `docs/OBSERVABILIDADE.md`: o que o Android manda e o que não manda.
