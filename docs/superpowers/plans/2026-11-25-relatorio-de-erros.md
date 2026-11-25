# Plano: relatório de erros do app (obs-erros)

Decisão e limites: [ADR 0068](../../adr/0068-relatorio-de-erros-do-app.md). Branch
`feat/obs-erros-do-app`. Migration **000212**. Este plano é o contrato entre as
partes (backend, renderer/main, painel, Android).

## Contrato da API

### `POST /api/obs/errors` (login de conta; visitante → 401)

```json
{
  "context": { "os": "Windows", "app_version": "1.4.2", "target": "desktop" },
  "errors": [
    {
      "source": "renderer",
      "kind": "TypeError",
      "message": "Cannot read properties of undefined (reading 'id')",
      "stack": "TypeError: ...\n    at Xy (assets/index-abc123.js:1:23456)\n    at ...",
      "screen": "/servers/:id/channels/:id",
      "in_call": true,
      "in_live": false,
      "count": 3
    }
  ]
}
```

- `target`: `desktop` | `web` | `android`. `source` do cliente: `renderer` | `main` |
  `mobile` (o `backend` só nasce no servidor; vindo do cliente → 400).
- Respostas: 204 gravado; 400 corpo inválido; 401; 429 com `Retry-After`.
- O servidor limpa de novo (mesmas regras do aparelho), corta, calcula a impressão
  digital e descarta além dos tetos (120 erros/h por pessoa, 1200/h no total) sem
  erro (204).

### `GET /api/obs/errors?days=7&source=&version=` (só devs, `dev_badge_users`)

```json
{
  "from": "2026-11-18T12:00:00Z", "to": "2026-11-25T12:00:00Z",
  "versions": ["1.4.2", "1.4.1"],
  "groups": [{
    "fingerprint": "9f1c…", "source": "renderer", "kind": "TypeError",
    "message": "Cannot read properties of undefined (reading 'id')",
    "first_seen": "…", "last_seen": "…", "count": 40, "users": 6,
    "versions": ["1.4.2"], "systems": ["Windows", "Linux"], "targets": ["desktop", "web"],
    "new_in_version": true
  }]
}
```

Ordem: `users` desc, depois `last_seen` desc; até 200 grupos. `versions` (raiz) = as
versões vistas na janela, da mais nova (semver). `new_in_version`: todas as
ocorrências do grupo (na retenção inteira) são da versão mais nova daquela origem.
`days` de 1 a 14 (padrão 7); `source` vazio ou uma das 4 origens; `version` vazio
ou texto até 32 B.

### `GET /api/obs/errors/:fingerprint?days=7` (só devs)

```json
{
  "group": { "...": "os mesmos campos de um item de groups" },
  "stack": "pilha crua guardada (limpa)",
  "translated": "pilha traduzida pelos source maps, ou \"\" quando não deu",
  "screens": [{ "screen": "/servers/:id", "count": 30 }],
  "recent": [{
    "at": "2026-11-25T11:00:00Z", "username": "ana", "app_version": "1.4.2",
    "os": "Windows", "target": "desktop", "screen": "/servers/:id",
    "in_call": false, "in_live": false, "count": 4
  }]
}
```

`recent`: as 30 linhas de ocorrência mais novas. 404 se o grupo não existe.

## Regras de limpeza (iguais no TS e no Go; teste de tabela nos dois)

1. Query string e fragmento de URL saem, de qualquer esquema (`https://x/a?token=1#y`
   → `https://x/a`, `salinha://x?y=1` → `salinha://x`) e de URL relativa (`GET
   /api/media/x?token=abc` → `GET /api/media/x`); o `:linha:coluna` do quadro fica.
2. `Bearer <qualquer>` (sem diferenciar caixa) → `Bearer <token>`; JWT (`eyJ….….…`) → `<token>`; sequência
   hex/base64url ≥ 32 caracteres → `<token>`.
3. E-mail → `<email>`; UUID → `<id>`.
4. Caminho de usuário: `C:\Users\<nome>`, `C:/Users/<nome>`, `/home/<nome>`,
   `/Users/<nome>` → mesmo prefixo com `<user>` (inclui `file:///C:/Users/...`; no
   Windows sem diferenciar caixa e com a barra repetida ou escapada, `C:\\Users\\…`).
5. Texto entre aspas (`"…"`, `'…'`, `` `…` ``) com mais de 24 caracteres → `"…"`.
6. No aparelho, a entrada crua é cortada **antes** das regras (mensagem até 2 KB;
   pilha até 30 linhas de 1 KB e 8 KB no total), para uma mensagem enorme não travar
   o app. Mensagem: uma linha, até 300 bytes. Pilha: até 30 linhas, 4 KB, cada quadro com
   a URL reduzida ao caminho (sem origem): `https://app/assets/index-abc.js:1:2` →
   `assets/index-abc.js:1:2`; `file:///…/app.asar/out/renderer/assets/x.js` →
   `out/renderer/assets/x.js`.

Impressão digital (só no servidor): `sha256(source \x00 kind \x00 msgNorm \x00
frame1 \x00 frame2 \x00 frame3)` em hex, onde `msgNorm` = mensagem limpa com
números → `N`, e cada quadro = nome do arquivo sem hash do Vite (`index-abc123.js`
→ `index.js`; `index.android.bundle` fica), sem linha/coluna. Em JS o nome da função
fica de fora (web e Hermes são minificados: o nome muda a cada build); no Go entra
(`server.(*Handler).Get handler.go`). Consequência aceita: erros diferentes no mesmo
bundle com o mesmo tipo e a mesma mensagem caem no mesmo grupo.

## Erros que não vão (aparelho)

Rede esperada (`Failed to fetch`, `NetworkError`, `Load failed`, `AbortError`,
`ApiError` do client, `Failed to fetch dynamically imported module`,
`Importing a module script failed`), `ResizeObserver loop…`, pilha que começa em
`chrome-extension://` / `moz-extension://` / `safari-extension://`.

## Tarefas

### A. Backend (`backend/internal/apperrors/`, `internal/platform/recovery/`)
1. Commit estrutural: nenhum (código novo).
2. `platform/recovery`: `Middleware()` (troca o `gin.Recovery()` em `cmd/router.go`:
   mesmo log com a pilha, 500) e `Observe(func(Panic))` (`Panic{Route, Method,
   Value, Stack, UserID}`); observador que dá panic não derruba nada.
3. Migration 000212 (`app_error_groups`, `app_error_occurrences` com `UNIQUE NULLS
   NOT DISTINCT (fingerprint, user_id, hour, app_version)`).
4. `scrub.go`, `fingerprint.go`, `validate.go` (testes de tabela).
5. `repository.go` (`SaveAll` com upsert do grupo e da ocorrência; `Prune`),
   `alerts.go` (`GroupsFirstSeenSince`, `AffectedByGroup` para o obs-alertas).
6. `ingest_handler.go` (`POST /obs/errors`, limiter por pessoa e global).
7. `panic_recorder.go` (observador: junta em memória, grava a cada 10 s, ≤ 50).
8. `sourcemap.go` (VLQ, ECMA-426), `translate.go` (`SOURCEMAPS_DIR`, cache de 2 mapas).
9. `report_*.go` (`GET /obs/errors`, `GET /obs/errors/:fingerprint`, `new_in_version`).
10. `cmd/wire_apperrors.go` + 1 linha em `wire.go`; retenção com `liveobs.NewRetention`.

### B. Renderer, main e build (`frontend/`)
1. `src/shared/errorScrub.ts` (regras acima, teste de tabela).
2. `renderer/src/shared/lib/errorSink.ts` (porta: `reportAppError(error, where)`), e
   `AppErrorBoundary`/`RouteErrorScreen` chamando ela.
3. `features/errorReports/lib`: `errorCapture.ts` (unknown → erro capturado, filtro),
   `errorQueue.ts` (dedup, tetos, envio a cada 30 s), `routePattern.ts`,
   `errorReportStart.ts` (`window.onerror`, `unhandledrejection`, ponte do main);
   `api/errorReports.ts`. Uma linha em `main.tsx`.
4. `src/main/errorReport/`: fila do main (20 grupos), `uncaughtException`,
   `unhandledRejection`, `render-process-gone`, `child-process-gone`, saída
   inesperada de `concord-live`, `concord-audio` e overlay (código e sinal); IPC
   `error-report:*`; `preload/errorReportApi.ts` + 1 linha no preload.
5. Source maps: `sourcemap: 'hidden'` sem `sourcesContent`, plugin que move os
   `.map` para `frontend/sourcemaps/` (fora da saída, no `.gitignore`); deploy
   manda para `/opt/concord/sourcemaps/` e apaga os de mais de 90 dias.

### C. Painel (`features/errorReports/components`, `hooks`)
`ErrorsTab` (default, `{ days }`), lista de grupos, filtros (origem, versão), detalhe
(pilha traduzida, telas, últimas ocorrências), selo "novo nesta versão". Registro no
`panelTabs.tsx` se já estiver na develop; senão fica pendente no relatório.

### D. Android (`mobile/src/features/errorReports/`)
Porta `shared/lib/errorSink.ts` + `ErrorBoundary` chamando; `ErrorUtils` global (encadeado
no handler anterior); promessas rejeitadas (rastreador do Hermes); tela pelo padrão
dos segmentos do Expo Router; mesma limpeza (cópia adaptada), mesma fila; `target`
`android`, `source` `mobile`.

### E. Docs
`docs/OBSERVABILIDADE.md` (seção de erros: o que é coletado, o que é limpo,
consultas prontas), `docs/HOSPEDAGEM.md` se o deploy mudar.

## Verificação
`node scripts/affected-tests.mjs pr` verde; `node scripts/check-migrations.mjs origin/develop`;
revisão por subagente de contexto limpo.
