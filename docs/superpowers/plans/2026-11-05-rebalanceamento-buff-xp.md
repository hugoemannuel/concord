# Rebalanceamento do buff de XP de voz: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cada rank do buff de XP de voz passa a exigir mais pessoas elegíveis, com os mesmos multiplicadores.

**Architecture:** só os degraus de `boostPercent` (`backend/internal/level/boost.go`) mudam. O cliente deriva o rank do percentual, que não muda, então fica intocado.

**Tech Stack:** Go 1.26, `go test`.

**Spec:** `docs/superpowers/specs/2026-11-05-rebalanceamento-buff-xp-design.md`

## Global Constraints

- Degraus (elegíveis → %): 0–2 → 100; 3–4 → 125 (D); 5–6 → 150 (C); 7–9 → 175 (B); 10–12 → 200 (A); 13–15 → 250 (S); 16–19 → 300 (SS); 20+ → 400 (SSS).
- Nada muda em curva, XP base, elegibilidade, nível do servidor ou cliente.
- CRAP ≤ 15 em `boostPercent`; commits em português, sem atribuição a IA.

## Review Focus

- Call de 2 pessoas (a call "normal"): 1x, sem `voice:boost`. Teste: `TestBoostPercentSteps` (2 → 100) e `TestBoostMultipliesXP` ({2, XPPerMinute}).
- Fim do buff quando a call cai para 2 elegíveis: um único aviso com 100. Teste: `TestBoostEndIsAnnouncedOnce` (3 → 2).
- Bordas de cada degrau (último de um, primeiro do próximo). Teste: `TestBoostPercentSteps`.

---

### Task 1: novos degraus do buff

**Files:**
- Modify: `backend/internal/level/boost.go:5-27` (`boostPercent` e comentário)
- Test: `backend/internal/level/boost_test.go`, `backend/internal/level/service_test.go`

**Interfaces:**
- Produces: `boostPercent(eligible int) int` (assinatura igual).

- [ ] **Step 1: Atualizar os testes para os novos degraus**

`TestBoostPercentSteps`: tabela
`0:100, 1:100, 2:100, 3:125, 4:125, 5:150, 6:150, 7:175, 9:175, 10:200, 12:200, 13:250, 15:250, 16:300, 19:300, 20:400, 50:400`.

`TestCallBoostsGroupsByCallAndCountsDistinctUsers`: c1 (4 distintos) → `{125, 4}`, c2 (2) → `{100, 2}`, c3 → `{100, 1}`.

`service_test.go`, trocando a contagem antiga pelo primeiro da faixa nova (2→3, 3→5, 4→7, 5→10, 6→13, 8→16, 10→20):
- `TestBoostMultipliesXP`: `{1,10} {2,10} {3,12} {5,15} {7,17} {10,20} {13,25} {16,30} {20,40}` (via `XPPerMinute * pct / 100` como hoje).
- `TestBoostCarriesFractionalXP`: `{1,[10…]} {2,[10,10,10,10]} {3,[12,13,12,13]} {5,[15…]} {7,[17,18,17,18]} {10,[20…]} {13,[25…]} {16,[30…]} {20,[40…]}`; o check de `remainder == 0` vale para `users <= 2`.
- `TestBoostEventIsHeartbeatWhileBuffed`, `TestBoostEndIsAnnouncedWhenCallDisappears`, `TestBoostIsPublishedAgainAfterCallDisappears`, `TestBoostIsPublishedBeforeXPIsSaved`: `usersN(4)` → `usersN(7)`, esperado `{Percent: 175, Eligible: 7}`.
- `TestBoostStepChangePublishesNewPercent`: começa com 7, entram até 13 (`usersN(13)[7:]`), esperado `{250, 13}`; comentário "B (175) vira S (250)".
- `TestBoostEndIsAnnouncedOnce`: começa com 3, `voice.active[:2]` (sobra 2), último aviso `Percent 100, Eligible 2`.
- `TestRemainderIsDroppedWhenUserStopsBeingEligible` e `TestLevelUpUsesMultipliedXP`: `usersN(2)` → `usersN(3)` (valores 12/50/24 e o comentário do rank D seguem iguais).

- [ ] **Step 2: Rodar e ver falhar**

Run (em `backend/`): `go test ./internal/level -run 'Boost|Remainder|LevelUpUsesMultiplied'`
Expected: FAIL em `TestBoostPercentSteps` (ex.: `boostPercent(2) = 125, want 100`) e nos de serviço.

- [ ] **Step 3: Trocar os degraus em `boostPercent`**

Mesmo `switch` decrescente com os limiares 20/16/13/10/7/5/3 e os percentuais 400/300/250/200/175/150/125, default 100. Comentário: "D (3–4), C (5–6), B (7–9), A (10–12), S (13–15), SS (16–19), SSS (20+); 2 pessoas é a call normal, sem buff."

- [ ] **Step 4: Rodar e ver passar**

Run: `go test ./internal/level` e `go vet ./internal/level`
Expected: `ok`.

- [ ] **Step 5: Verificação do repo**

Run (raiz): `node scripts/crap.mjs --files backend/internal/level/boost.go` (≤ 15) e `node scripts/affected-tests.mjs pr`
Expected: tudo verde.

- [ ] **Step 6: Commit (só com autorização do usuário)**

```bash
git add backend/internal/level docs/superpowers
git commit -m "fix(level): exige mais pessoas em call para cada rank do buff de XP"
```
