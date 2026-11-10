# Ligar para quem está em call — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a DM toca para quem está em outra call e atender (ou ligar estando numa call) troca de call, como no Discord.

**Architecture:** o servidor (`internal/call`) para de recusar o chamado ocupado e faz a troca: tira a pessoa da call
antiga (sala WS + `leaveCall`) antes de pô-la na nova, no `StartDM` (quem liga) e no `Accept` (quem atende). Os
clientes só limpam a call antiga localmente, sem mandar "sair". No desktop a chamada recebida sai do `callStore`
(god store) para um `incomingCallStore` próprio, como no mobile.

**Tech Stack:** Go 1.26 (Gin, WS Hub), React + Zustand + Vitest (desktop), Expo + Zustand + Jest (mobile).

**Spec:** `docs/superpowers/specs/2026-11-10-ligar-para-quem-esta-em-call-design.md`

## Global Constraints

- Nada de método novo em `call/service.go` nem campo novo no `callStore`; `callStore.ts` (1950 linhas) sai do PR menor.
- CRAP ≤ 15 em toda função tocada (`node scripts/crap.mjs --files <arquivos>` antes e depois).
- TDD: teste falhando pelo motivo certo antes do código.
- Sem dependência nova. Sem texto novo para o usuário (só somem o toast de ocupado no caso comum e o título
  "Você já está em uma chamada" quando a call é outra).
- UI responsiva 360 px → largo, teclado e toque; componentes de `shared/ui`.
- Commits em português, convencionais, **sem** `Co-Authored-By` nem atribuição a IA. Só commitar com autorização do usuário.
- Checkout CRLF: formatar só os arquivos tocados (`gofmt -w <arquivo>`, `npx prettier --write <arquivo>`).

## Review Focus

1. **Atender uma DM que acabou de encerrar estando num canal** → a pessoa continua no canal (`Accept` valida antes de sair). Teste na Task 2.
2. **Estado de `busy` velho** (aponta para call de que a pessoa já não participa) → o `Accept` não entra em laço; tenta sair uma vez e segue. Teste na Task 2.
3. **Desktop: aceitar com o microfone falhando estando numa call** → a call atual fica intacta (o microfone novo abre antes de qualquer troca). Teste na Task 3.
4. **Desktop: ligar de novo para a mesma pessoa com quem já estou em call** → não derruba a call (botão desligado nessa conversa). Teste na Task 4.
5. **Mobile: aceitar enquanto está num canal** → não manda `call:leave` (o servidor já tira); a mídia antiga desliga. Teste na Task 5.

---

### Task 1: Servidor — quem liga troca de call e o chamado ocupado é chamado

**Files:**
- Create: `backend/internal/call/switch.go`, `backend/internal/call/switch_test.go`
- Modify: `backend/internal/call/dm_start.go` (`reserveDMLocked`, `StartDM`)
- Test: `backend/internal/call/dm_start_test.go` (`TestReserveDMLocked`, `TestCreateDM`)

**Interfaces:**
- Produces (em `switch.go`, funções do pacote, não métodos em `service.go`):
  - `func (s *Service) leaveForSwitch(ctx context.Context, userID, fromCallID string) error` — `s.leaveCallRoom(userID, fromCallID)` e depois `s.leaveCall(ctx, fromCallID, userID)` (mesma ordem do `move.go`).
  - `func (s *Service) ringingForLocked(userID string) bool` — true se alguma chamada com `Status == StatusRinging` tem `inviteeID == userID`.
  - `func (s *Service) switchCallerForDM(ctx context.Context, initiatorID, calleeID, conversationID string) error` — com `s.mu.RLock`: chamado `ringingForLocked` → `ErrBusy`; quem liga com `busy[initiatorID]` numa call que **não** é a DM ativa desta conversa → solta o lock e `leaveForSwitch`. Caso contrário `nil`.

- [ ] **Step 1: Testes falhando** (em `switch_test.go`, rig = `serviceWithCall` + `fakePublisher` + `s.leaveCall` falso que registra `(callID,userID)` e faz `delete(s.busy, userID)`)
  - `TestSwitchCallerForDM/quem liga num canal sai dele`: `busy["ana"]="canal"` → `err == nil`, `leaveCall` chamado com `("canal","ana")`.
  - `TestSwitchCallerForDM/quem liga já na DM desta conversa fica`: call `call-1` tipo DM com `ConversationID="cv-1"`, `busy["ana"]="call-1"` → `leaveCall` não chamado.
  - `TestSwitchCallerForDM/chamado já tocando para outra DM: ocupado`: call tocando com `inviteeID="bia"` → `errors.Is(err, ErrBusy)`, `leaveCall` não chamado.
  - `TestSwitchCallerForDM/livre não faz nada`.
- [ ] **Step 2: Ajustar testes antigos para o comportamento novo**
  - `TestReserveDMLocked/"chamado ocupado: ocupado"` → renomear para `"chamado em outra chamada: livre para tocar"` e esperar `call == nil && err == nil`.
  - `TestCreateDM/"ocupado não cria nada"` → `s.busy["bia"]="outra"`: cria a chamada e `pub.eventsOf("call:invite")[0].target == "user:bia"`. Manter um caso de ocupado com `s.busy["ana"]="outra"` (quem liga, sem passar pelo `StartDM`) → `ErrBusy`.
- [ ] **Step 3: Rodar e ver falhar**: `cd backend && go test ./internal/call -run 'TestSwitchCallerForDM|TestReserveDMLocked|TestCreateDM'` → FAIL (funções inexistentes / ErrBusy do chamado).
- [ ] **Step 4: Implementar** `switch.go`; em `reserveDMLocked` remover o `if _, ok := s.busy[calleeID]` ; em `StartDM` chamar `s.switchCallerForDM(ctx, initiatorID, calleeID, conv.ID)` depois de `checkDMCallable` e antes de `createDM`.
- [ ] **Step 5: Rodar e ver passar**: mesmo comando + `go test ./internal/call` inteiro → PASS.
- [ ] **Step 6: CRAP**: `node scripts/crap.mjs --files backend/internal/call/switch.go backend/internal/call/dm_start.go` → tudo ≤ 15.
- [ ] **Step 7: Commit** `feat(call): ligar estando em call troca de call e chama quem está em outra call`

### Task 2: Servidor — atender troca de call

**Files:**
- Modify: `backend/internal/call/dm_answer.go` (`Accept`)
- Test: `backend/internal/call/dm_answer_test.go`

**Interfaces:**
- Consumes: `leaveForSwitch` (Task 1).
- `Accept(ctx, callID, userID) error` mantém a assinatura. Validação (existe, não encerrou, é o convidado, já participante = no-op) acontece **antes** de qualquer saída. Se `busy[userID]` aponta para outra call: solta o lock, `leaveForSwitch(ctx, userID, otherID)` (erro → devolve o erro), retrava, **revalida** a chamada nova e, se `busy[userID]` ainda aponta para outra call, devolve `ErrBusy` (sem recursão, uma tentativa só). Extrair a validação num helper (ex. `acceptCheckLocked`) para manter CRAP ≤ 15.

- [ ] **Step 1: Testes falhando** (rig `answerRig()` + `s.leaveCall` falso como na Task 1)
  - Trocar `"chamado já em outra chamada: ocupado"` por `"chamado em outra chamada: sai dela e atende"`: `busy["bia"]="canal"` → `err == nil`, `leaveCall` com `("canal","bia")`, `s.busy["bia"] == "call-1"`, um `call:accept`.
  - `"chamada encerrada não tira ninguém da call atual"`: `busy["bia"]="canal"`, `Status = StatusEnded` → `ErrNotFound` e `leaveCall` não chamado.
  - `"busy velho não entra em laço"`: `leaveCall` falso que **não** limpa `busy` → `errors.Is(err, ErrBusy)` e `leaveCall` chamado exatamente 1 vez.
  - `"intruso não tira ninguém"`: `busy["intruso"]="canal"`, `Accept(..., "intruso")` → `ErrNotAllowed`, `leaveCall` não chamado.
- [ ] **Step 2: Rodar e ver falhar**: `go test ./internal/call -run TestAccept` → FAIL.
- [ ] **Step 3: Implementar** em `dm_answer.go`.
- [ ] **Step 4: Rodar e ver passar**: `go test ./internal/call` → PASS; `go vet ./internal/call`.
- [ ] **Step 5: CRAP** em `dm_answer.go` → ≤ 15.
- [ ] **Step 6: Commit** `feat(call): atender DM estando em outra call troca de call`

### Task 3: Desktop — chamada recebida em store próprio, tocando por cima da call

**Files:**
- Create: `frontend/src/renderer/src/features/call/store/incomingCallStore.ts` (+ `.test.ts`)
- Modify: `features/call/store/callStore.ts` (`'call:invite'`, `'call:ended'`, `acceptCall`, `declineCall`, `endCall`), `features/call/components/IncomingCallModal.tsx`, `features/call/components/CallOverlay.tsx`, `features/call/lib/callTypes.ts`
- Test: `features/call/store/callStore.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface IncomingCall { callId: string; conversationId: string | null; initiator: CallUserInfo }
  interface IncomingCallState { call: IncomingCall | null; ring: (c: IncomingCall) => void; clear: () => void }
  export const useIncomingCallStore
  ```
  `ring` com outra chamada já tocando é ignorado (fica a primeira).
- `callStore`: `'call:invite'` (tipo `dm`) → `useIncomingCallStore.getState().ring(...)` + `notifyDesktop`, **qualquer** que seja o `status`; não mexe mais no estado da call. `'call:ended'` com `call_id` da chamada que toca → `clear()`. `acceptCall()`: abre o microfone num handle local **antes** de tudo (falhou → toast atual, nada muda); `acceptDm(callId)` falhou → fecha esse handle e nada muda; deu certo → `cleanup()` da call atual (só local, **sem** `call:leave`), `clear()` do incoming, `localMic = handle`, monta o estado ativo da DM (os campos que o `'call:invite'` montava, com `status: 'active'`), assina a sala e `connectMedia`. `declineCall()`: manda `call:decline` da chamada que toca e `clear()`; a call atual não muda. `endCall()`: some o ramo `status === 'ringing'`. `CallStatus` perde `'ringing'`.
- `IncomingCallModal` lê `useIncomingCallStore`; toque enquanto `call !== null`; `Esc` recusa; foco inicial no Atender; ao aceitar navega para `/dm/<initiator.id>`.

- [ ] **Step 1: Testes falhando**
  - `incomingCallStore.test.ts`: `ring` guarda; segundo `ring` com outro `callId` é ignorado; `clear` zera.
  - `callStore.test.ts`: `"convite com call ativa toca sem derrubar a call"` (depois de `joinChannel()`, `call:invite` → `useIncomingCallStore.getState().call?.callId === 'dm-1'` e `status === 'active'`, `callId === 'call-1'`); `"aceitar estando em canal limpa a call local sem call:leave e entra na DM"` (`chat.sendEvent` não chamado com `'call:leave'`; `status === 'active'`, `callId === 'dm-1'`, `type === 'dm'`); `"recusar mantém a call atual"`; `"microfone falhando ao aceitar mantém a call atual"` (`rtc.getAudioStream` rejeita → `callId === 'call-1'`); `"call:ended da chamada que toca limpa o convite"`. Ajustar o teste existente `"não avisa mudo/ensurdecido antes de a chamada estar ativa (DM tocando)"` para o status `idle`.
- [ ] **Step 2: Rodar e ver falhar**: `cd frontend && npx vitest run src/renderer/src/features/call/store` → FAIL.
- [ ] **Step 3: Implementar.** Se o `callStore.ts` não sair menor que 1950 linhas, extrair o `openMic` para `features/call/lib/openMic.ts` (fábrica recebendo `get`/`set`).
- [ ] **Step 4: Rodar e ver passar**: mesmo comando + `yarn typecheck` → verde; `wc -l callStore.ts` < 1950.
- [ ] **Step 5: Conferir o modal** em 360 px e largo (`yarn dev:web`), teclado (Tab/Enter/Esc).
- [ ] **Step 6: CRAP** nos arquivos tocados → ≤ 15.
- [ ] **Step 7: Commit** `feat(call): chamada recebida toca por cima da call no desktop e atender troca de call`

### Task 4: Desktop — ligar estando numa call

**Files:**
- Modify: `features/call/store/callStore.ts` (`startDMCall`), `features/chat/lib/dmCall.ts` (`dmCallButton`) e quem o chama
- Test: `features/call/store/callStore.test.ts`, `features/chat/lib/dmCall.test.ts`

**Interfaces:**
- `dmCallButton(o: { online; hasConversation; inThisCall: boolean; blocked })`: troca `callStatus` por `inThisCall` (estou numa call da DM desta conversa). Desligado se `!online || !hasConversation || inThisCall || blocked`; título `'Você já está em uma chamada'` só quando `inThisCall`.
- `startDMCall(conversationId, peer)`: se já estou na call desta conversa → não faz nada. Senão abre o microfone num handle local, chama `startCallApi`; falhou → fecha o handle e a call atual fica; deu certo → `cleanup()` da call atual (local, sem `call:leave`), `localMic = handle`, estado `outgoing` como hoje.

- [ ] **Step 1: Testes falhando**: `dmCall.test.ts` — `"em call de outra conversa o botão liga"` (`inThisCall: false` → `disabled: false`, título `'Iniciar chamada de voz'`) e `"na call desta conversa fica desligado"`. `callStore.test.ts` — `"ligar estando em canal sai dele localmente e fica tocando"` (sem `'call:leave'`; `status === 'outgoing'`, `type === 'dm'`); `"ligar falhando mantém a call atual"`.
- [ ] **Step 2: Rodar e ver falhar**: `npx vitest run src/renderer/src/features/chat/lib/dmCall.test.ts src/renderer/src/features/call/store/callStore.test.ts` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e ver passar** + `yarn typecheck`.
- [ ] **Step 5: CRAP** → ≤ 15; `callStore.ts` continua < 1950 linhas.
- [ ] **Step 6: Commit** `feat(call): ligar estando numa call no desktop troca de call`

### Task 5: Mobile — tocar por cima da call e trocar sem avisar saída

**Files:**
- Modify: `mobile/src/features/call/lib/callEvents.ts` (`onInvite`), `mobile/src/features/call/lib/callInviteTap.ts`, `mobile/src/features/call/lib/callController.ts` (`acceptIncoming`, `callDm`)
- Test: `callEvents.test.ts`, `callInviteTap.test.ts`, `callController.test.ts`

**Interfaces:**
- `onInvite`: só filtra `p.type !== 'dm'`. `handleCallInviteTap`: remove o `return` por `phase !== 'idle'`.
- `acceptIncoming` e `callDm`: `leave()` vira `leave(false)` (sem `call:leave`; o servidor já tira).
- Conferir que a rota `chamada-recebida` abre por cima da tela da call (quem navega ao ver `incomingCallStore.call`).

- [ ] **Step 1: Testes falhando**: `callEvents.test.ts` — `"convite com call ativa toca"` (sessão `active` → `useIncomingCallStore.getState().call?.callId === 'c9'`). `callInviteTap.test.ts` — `"em call, ainda abre a tela de atender"`. `callController.test.ts` — `"aceitar em call não manda call:leave"` e `"ligar em call não manda call:leave"` (`ws.send` não chamado com `'call:leave'`).
- [ ] **Step 2: Rodar e ver falhar**: `cd mobile && npx jest src/features/call/lib` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e ver passar** + `yarn typecheck`.
- [ ] **Step 5: CRAP** → ≤ 15.
- [ ] **Step 6: Commit** `feat(call): app toca a chamada por cima da call e atender troca de call`

### Task 6: Verificação final

- [ ] **Step 1**: `node scripts/affected-tests.mjs pr` → verde (afetados, vet/typecheck, estrutura, design, CRAP). Guardar a saída.
- [ ] **Step 2**: teste manual com dois usuários (backend local + `livekit-server.exe` nativo): A num canal de voz, B liga para A → toca; A atende → sai do canal (lista do canal atualiza) e entra na DM com áudio; repetir com B num canal ligando.
- [ ] **Step 3**: commit do spec e do plano: `docs: spec e plano de ligar para quem está em call`.
