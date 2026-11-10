# Plano: modo lento por canal (issue #586)

Spec: [2026-11-09-modo-lento-design.md](../specs/2026-11-09-modo-lento-design.md).
Cada tarefa: teste primeiro (falhando pelo motivo certo) → código mínimo → verde.

## Estrutural (commit próprio, sem mudança de comportamento)

1. Tirar `updateChannel` do `serverStore` (god store): o `ChannelFormModal` chama
   `api/channels.updateChannel` e `fetchChannels`.

## Backend

2. Migration `000204_channels_slowmode` (coluna + CHECK).
3. `channel/slowmode.go`: `ValidSlowmode` (tabela de valores). Teste unitário.
4. `Channel.SlowmodeSeconds`; repositório lê a coluna em `FindByID`/`ListByServerID`, grava
   em `Update` (opcional) e expõe `SlowmodeSeconds`. `Service.Update` recebe
   `UpdateInput{Name, SlowmodeSeconds *int}` e recusa valor fora da lista
   (`ErrInvalidSlowmode` → 400 `invalid_slowmode`). Testes no fake do service + handler.
5. Auditoria: `recordUpdate` também compara `slowmode_seconds`. Teste.
6. `message/slowmode.go`: `Slowmode.Take/Release` (intervalo do canal, isenção por
   MANAGE_MESSAGES|MANAGE_CHANNELS, mapa em memória com poda). Testes com relógio falso.
7. Ligar o portão em `Service.CreateChannelMessage` e `TTSService.SendToChannel`
   (Release se falhar) e responder 429 `slowmode` com `retry_after` nos dois handlers.
   Wire em `cmd/`. Testes de handler.

## Desktop/web

8. `chat/lib/slowmode.ts`: opções, `slowmodeLabel`, `formatWait`, `slowmodeBarText`,
   `slowmodeErrorText`, `retryAfterOf(err)`. Testes.
9. `chatPermissions`: `bypassSlowmode`. `sendErrorText` trata `slowmode`. Testes.
10. `slowmodeStore` + `useSlowmode(room, exempt)` + `SlowmodeBar`; `ChatComposer` mostra a
    faixa e `useComposerSend` bloqueia/marca a vez. Testes.
11. `ChannelFormModal` + `channelForm.saveChannel`: seletor "Modo lento" ao editar. Testes.

## Mobile

12. `SendOutcome` com `{ slowmode }` e aviso no `Composer` (`sendNotice`). Testes.

## Fecho

13. Docs (`docs/CARGOS.md`), CRAP, `affected-tests pr`, revisão, PR.
