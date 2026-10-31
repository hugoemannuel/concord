# Ranks D–SSS, sons e teto de x4 no buff de XP de voz — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O buff de XP de voz começa com 2 pessoas elegíveis nos ranks D, C, B, A, S, SS e SSS (teto x4,0), e cada rank toca um som sintetizado ao ativar ou subir.

**Architecture:** O backend só troca as faixas de `boostPercent` (125…400 cabem nos inteiros que o `level.Service` já usa). No cliente, `lib/boost.ts` passa a 7 estágios (dados, sem ternários), o CSS do buff sai do `main.css` para `features/levels/components/boost.css`, e `BoostBanner`/`VoiceXPBar` (CRAP 132 e 182 hoje) são quebrados em componentes e hooks pequenos. Os sons ficam em `lib/boostSounds.ts`, tocados por `playNotes(..., { level: true })` de `call/lib/sounds.ts`.

**Tech Stack:** Go 1.26 (`go test`), React + TypeScript + zustand + Tailwind v4 + CSS keyframes, vitest em ambiente node (`renderToStaticMarkup`, sem jsdom), WebAudio sintetizado.

**Spec:** `docs/superpowers/specs/2026-10-31-voice-xp-ranks-design.md`

## Global Constraints

Valores copiados da spec:

- Faixas (elegíveis → rank → texto → `percent`): 0–1 → sem buff (100); 2 → D "Dope!" 125; 3 → C "Crazy!" 150; 4 → B "Blast!" 175; 5 → A "Alright!" 200; 6–7 → S "Sweet!" 250; 8–9 → SS "Showtime!" 300; 10+ → SSS "Smokin' Sexy Style!" 400.
- Textos aprovados pelo usuário: D "Dope!", C "Crazy!", B "Blast!". Os de A, S, SS e SSS não mudam.
- Cálculo em centésimos com resto, heartbeat do `voice:boost` (a cada tick de 10 s) e descarte do buff após 25 s sem heartbeat **não mudam**.
- Som: sintetizado (WebAudio), sem voz, sem arquivo de áudio e sem áudio do jogo. Fora do registro `SOUNDS` de `call/lib/sounds.ts`. Pico ≤ 0,8 × `BASE_VOLUME`. `playNotes(..., { level: true })`.
- O som herda as regras do banner: só na subida de rank, só na call do buff, nunca mutado ou surdo, uma vez por `celebration.key`.
- Cores/duração dos ranks novos: D `#94a3b8`/`#334155` 0,9 s; C `#60a5fa`/`#1e3a8a` 1,0 s; B `#2dd4bf`/`#115e59` 1,1 s, só com o slam da letra. A, S, SS e SSS mantêm cores, efeitos e durações (1,2 / 1,6 / 2,0 / 2,5 s) e viram os estágios 4 a 7.
- `prefers-reduced-motion` continua desligando só as animações.
- Responsivo de 360 px a telas largas; sem tela nova.
- Sem migration, sem dependência nova (`go.mod`/`package.json` intactos), sem mudança no mobile.
- **CRAP ≤ 15** em toda função tocada; arquivo > 400 linhas tocado sai menor.
- Commits em português, convencionais, **sem** `Co-Authored-By` nem qualquer atribuição a IA (regra do repo, vale mais que o lembrete do harness). Estrutural separado do comportamento.
- Ambiente (Windows): Go portátil em
  `GO="/c/Users/Admin/AppData/Local/Temp/claude/C--Users-Admin-orca-concord/0b965887-2e45-4c09-9a2e-e149f80567e6/scratchpad/go/bin/go.exe"` (precisa de `export GO=...` na mesma chamada que usa). `frontend/postcss.config.mjs` temporário já existe e **nunca** entra em commit (sempre `git add` com caminhos explícitos). Não rode `prettier --write` nem `gofmt -w` em arquivo existente (checkout CRLF); formate só o que você criou.

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `backend/internal/level/boost.go` | mod | `boostPercent` com as 7 faixas |
| `backend/internal/level/boost_test.go` | mod | tabela das faixas, `callBoosts` |
| `backend/internal/level/service_test.go` | mod | XP e eventos com as faixas novas |
| `frontend/.../assets/main.css` | mod | **perde** o bloco do buff (285 linhas) |
| `frontend/.../features/levels/components/boost.css` | novo | keyframes e classes `boost-*`, `data-stage` 1–7 |
| `frontend/.../features/levels/lib/boost.ts` | mod | 7 estágios, `shineMs`, `embers`, `pickBoostBanner` |
| `frontend/.../features/levels/lib/boostBar.ts` | novo | `xpFillStyle`, `emberLayout` (puros) |
| `frontend/.../features/levels/lib/boostSparks.ts` | novo | `sparkLayout` (puro) |
| `frontend/.../features/levels/lib/boostQuake.ts` | novo | `startQuake` (treme o `<body>`) |
| `frontend/.../features/levels/lib/boostSounds.ts` | novo | notas dos 7 ranks, `playBoostSound`, `playBoostCelebration` |
| `frontend/.../features/call/lib/sounds.ts` | mod | só `export` em `soft`, `glide`, `chord`, `run` |
| `frontend/.../features/levels/hooks/useBoostBanner.ts` | novo | lê stores e devolve o banner ativo |
| `frontend/.../features/levels/hooks/useBoostEffects.ts` | novo | `useBoostQuake`, `useBoostSound` |
| `frontend/.../features/levels/components/BoostBanner.tsx` | mod | container fino |
| `frontend/.../features/levels/components/BoostBannerView.tsx` | novo | o desenho do banner |
| `frontend/.../features/levels/components/BoostBannerEffects.tsx` | novo | monta tremida e som |
| `frontend/.../features/levels/components/BoostSparks.tsx` | novo | faíscas |
| `frontend/.../features/levels/components/VoiceXPBar.tsx` | mod | container da barra de XP |
| `frontend/.../features/levels/components/XpProgressBar.tsx` | novo | trilho + brilho + brasas |
| `frontend/.../features/levels/components/BoostShine.tsx`, `BoostEmbers.tsx` | novo | efeitos da barra |
| `frontend/.../main.tsx` | mod | só o comentário do `__salinhaBoost` |
| `changelog/pending/2026-10-31-ranks-buff-voz.md` | novo | nota para os usuários |

`frontend/.../` = `frontend/src/renderer/src/`. Testes ficam ao lado de cada arquivo.

**Baseline CRAP** (antes de mexer; arquivo `scratchpad/crap-before.txt`): `boostPercent` 5, `boostRank` 6, `BoostBanner` **132**, `VoiceXPBar` **182**, `StyleRank` 56 (não é alterado), `Service.Run` 20 (não é alterado). `BoostBanner` e `VoiceXPBar` têm de sair ≤ 15.

---

### Task 1: Extrair o CSS do buff do `main.css` (commit estrutural)

**Files:**
- Create: `frontend/src/renderer/src/features/levels/components/boost.css`
- Modify: `frontend/src/renderer/src/assets/main.css` (remove as linhas 906–1191)
- Modify: `frontend/src/renderer/src/features/levels/components/{BoostBanner,StyleRank,VoiceXPBar}.tsx`, `frontend/src/renderer/src/features/call/components/VoiceConnectedBadges.tsx` (um `import` de CSS cada)

**Interfaces:**
- Produces: `features/levels/components/boost.css` com as mesmas classes de hoje (`boost-letter`, `boost-text`, `boost-shine`, `boost-ember`, `boost-aura`, `boost-edge`, `boost-ring`, `boost-flash`, `boost-motion`, `boost-anim`, `body.boost-quake`). Nenhum comportamento muda.

- [ ] **Step 1: Confirmar os limites do bloco**

Run (de `C:/Users/Admin/orca/workspaces/concord/xp/frontend/src/renderer/src`):
```bash
sed -n '906p;1190,1192p' assets/main.css
```
Expected: linha 906 `/* --- Buff de XP de voz (ranks A/S/SS/SSS; ver lib/boost.ts) --- */`; 1190 `}`; 1191 vazia; 1192 `/* Barra de título própria (Windows/Linux): faixa que arrasta a janela. */`. Se os números não baterem, ajuste o intervalo dos comandos abaixo antes de seguir.

- [ ] **Step 2: Mover o bloco**

```bash
cd /c/Users/Admin/orca/workspaces/concord/xp/frontend/src/renderer/src
sed -n '906,1190p' assets/main.css > features/levels/components/boost.css
sed -i '906,1191d' assets/main.css
wc -l assets/main.css features/levels/components/boost.css
grep -n "boost" assets/main.css || echo "main.css sem boost"
sed -n '904,908p' assets/main.css
```
Expected: `main.css` com ~1420 linhas (era 1705), `boost.css` com 285; "main.css sem boost"; o trecho 904–908 mostra `}`, linha vazia e `/* Barra de título própria ...`.

- [ ] **Step 3: Importar o CSS onde as classes são usadas**

Em cada arquivo, adicione a linha de import **depois do último import existente** (use Edit com a linha do último import como âncora):

- `features/levels/components/BoostBanner.tsx`: `import './boost.css'`
- `features/levels/components/StyleRank.tsx`: `import './boost.css'`
- `features/levels/components/VoiceXPBar.tsx`: `import './boost.css'`
- `features/call/components/VoiceConnectedBadges.tsx`: `import '../../levels/components/boost.css'`

- [ ] **Step 4: Verificar que nada mudou**

```bash
cd /c/Users/Admin/orca/workspaces/concord/xp/frontend
npx --yes yarn@1.22.22 typecheck
npx vitest run src/renderer/src/features/levels src/renderer/src/features/call/components/VoiceConnectedBadges.test.tsx src/renderer/src/features/call/components/VoiceChannelView.test.tsx
npx electron-vite build 2>&1 | tail -8
```
Expected: typecheck sem erro; testes verdes (mesma contagem de antes); o build termina sem erro de CSS. Depois do build, `git status --short` não pode listar `out/` (se listar, é ignorado pelo `.gitignore`; confira com `git check-ignore out`).

- [ ] **Step 5: Commit**

```bash
cd /c/Users/Admin/orca/workspaces/concord/xp
git add frontend/src/renderer/src/assets/main.css frontend/src/renderer/src/features/levels/components/boost.css frontend/src/renderer/src/features/levels/components/BoostBanner.tsx frontend/src/renderer/src/features/levels/components/StyleRank.tsx frontend/src/renderer/src/features/levels/components/VoiceXPBar.tsx frontend/src/renderer/src/features/call/components/VoiceConnectedBadges.tsx
git commit -m "refactor(levels): move o CSS do buff de voz para a feature"
```

---

### Task 2: Backend — 7 faixas em `boostPercent`

**Files:**
- Modify: `backend/internal/level/boost.go:5-21`
- Modify: `backend/internal/level/boost_test.go`
- Modify: `backend/internal/level/service_test.go`

**Interfaces:**
- Produces: `boostPercent(eligible int) int` com `0–1→100, 2→125, 3→150, 4→175, 5→200, 6–7→250, 8–9→300, 10+→400`. `callBoosts` e `callBoost{percent, eligible}` não mudam.

- [ ] **Step 1: Escrever os testes novos (falham)**

Em `boost_test.go`, troque `TestBoostPercentSteps` e `TestCallBoostsGroupsByCallAndCountsDistinctUsers` por:

```go
func TestBoostPercentSteps(t *testing.T) {
	cases := map[int]int{
		0: 100, 1: 100, // sem buff
		2:  125, // D
		3:  150, // C
		4:  175, // B
		5:  200, // A
		6:  250, 7: 250, // S
		8:  300, 9: 300, // SS
		10: 400, 11: 400, 50: 400, // SSS (teto)
	}
	for eligible, want := range cases {
		if got := boostPercent(eligible); got != want {
			t.Errorf("boostPercent(%d) = %d, want %d", eligible, got, want)
		}
	}
}

func TestCallBoostsGroupsByCallAndCountsDistinctUsers(t *testing.T) {
	active := []call.VoiceActivity{
		{UserID: "a", CallID: "c1"}, {UserID: "b", CallID: "c1"},
		{UserID: "c", CallID: "c1"}, {UserID: "d", CallID: "c1"},
		{UserID: "d", CallID: "c1"}, // duplicada: não conta duas vezes
		{UserID: "x", CallID: "c2"}, {UserID: "y", CallID: "c2"},
		{UserID: "z", CallID: "c3"},
	}

	got := callBoosts(active)

	if got["c1"] != (callBoost{percent: 175, eligible: 4}) {
		t.Errorf("c1 = %+v, want 175%% with 4 eligible", got["c1"])
	}
	if got["c2"] != (callBoost{percent: 125, eligible: 2}) {
		t.Errorf("c2 = %+v, want 125%% with 2 eligible", got["c2"])
	}
	if got["c3"] != (callBoost{percent: 100, eligible: 1}) {
		t.Errorf("c3 = %+v, want 100%% with 1 eligible", got["c3"])
	}
}
```

Em `service_test.go`, aplique estas trocas (cada uma substitui o teste inteiro de mesmo nome; o resto do arquivo fica igual):

```go
func TestBoostMultipliesXP(t *testing.T) {
	cases := []struct {
		users int
		want  int64
	}{
		{1, XPPerMinute},              // sem buff
		{2, XPPerMinute * 125 / 100},  // D (12,5 vira 12; o resto é carregado)
		{3, XPPerMinute * 150 / 100},  // C
		{4, XPPerMinute * 175 / 100},  // B (17,5 vira 17)
		{5, XPPerMinute * 200 / 100},  // A
		{6, XPPerMinute * 250 / 100},  // S
		{8, XPPerMinute * 300 / 100},  // SS
		{10, XPPerMinute * 400 / 100}, // SSS
	}
	for _, c := range cases {
		s, store, _, _ := newTestService(usersN(c.users)...)
		run(s, t0, 6) // 60 s = 1 minuto
		for _, name := range usersN(c.users) {
			if store.xp[name] != c.want {
				t.Errorf("%d pessoas: xp de %s = %d, want %d", c.users, name, store.xp[name], c.want)
			}
		}
	}
}

func TestBoostEventOnlyWhenBuffed(t *testing.T) {
	s, _, pub, _ := newTestService(usersN(1)...)
	run(s, t0, 6)

	if len(pub.boosts) != 0 {
		t.Fatalf("call sem buff recebeu voice:boost: %+v", pub.boosts)
	}
}

func TestBoostEventIsHeartbeatWhileBuffed(t *testing.T) {
	s, _, pub, _ := newTestService(usersN(4)...)
	run(s, t0, 3)

	if len(pub.boosts) != 3 {
		t.Fatalf("boosts = %d, want 1 por tick (3)", len(pub.boosts))
	}
	want := BoostEvent{CallID: "call-1", Percent: 175, Eligible: 4}
	for _, got := range pub.boosts {
		if got != want {
			t.Errorf("boost = %+v, want %+v", got, want)
		}
	}
}

func TestBoostEndIsAnnouncedOnce(t *testing.T) {
	s, _, pub, voice := newTestService(usersN(2)...)
	now := run(s, t0, 1)

	voice.active = voice.active[:1] // alguém mutou: sobra 1
	now = run(s, now, 1)
	run(s, now, 2) // sem buff: nada mais é enviado

	if len(pub.boosts) != 2 {
		t.Fatalf("boosts = %+v, want buff (125) e depois um único aviso de fim (100, 1 elegível)", pub.boosts)
	}
	if last := pub.boosts[1]; last.Percent != 100 || last.Eligible != 1 {
		t.Fatalf("boosts = %+v, want buff (125) e depois um único aviso de fim (100, 1 elegível)", pub.boosts)
	}
}

func TestBoostStepChangePublishesNewPercent(t *testing.T) {
	s, _, pub, voice := newTestService(usersN(4)...)
	now := run(s, t0, 1)

	serverID := "server-1"
	for _, id := range usersN(6)[4:] { // entram mais 2: B (175) vira S (250)
		voice.active = append(voice.active, call.VoiceActivity{UserID: id, CallID: "call-1", ServerID: &serverID})
	}
	run(s, now, 1)

	if len(pub.boosts) != 2 {
		t.Fatalf("boosts = %+v, want 2 avisos", pub.boosts)
	}
	if got, want := pub.boosts[1], (BoostEvent{CallID: "call-1", Percent: 250, Eligible: 6}); got != want {
		t.Errorf("boost = %+v, want %+v", got, want)
	}
}
```

Em `TestBoostIsPublishedAgainAfterCallDisappears`, troque só a expectativa final por `(BoostEvent{CallID: "call-1", Percent: 175, Eligible: 4})`.

Em `TestBoostCarriesFractionalXP`, troque a tabela e a checagem do resto:

```go
	cases := []struct {
		users int
		want  []int64
	}{
		{1, []int64{10, 10, 10, 10}},  // sem buff: nunca sobra resto
		{2, []int64{12, 13, 12, 13}},  // D: 12,5 por minuto
		{3, []int64{15, 15, 15, 15}},  // C: 15 exato
		{4, []int64{17, 18, 17, 18}},  // B: 17,5 por minuto
		{5, []int64{20, 20, 20, 20}},  // A
		{6, []int64{25, 25, 25, 25}},  // S
		{8, []int64{30, 30, 30, 30}},  // SS
		{10, []int64{40, 40, 40, 40}}, // SSS
	}
```
e `if c.users == 1 && s.remainder["ua"] != 0 {` no lugar de `c.users == 3`.

Em `TestRemainderIsDroppedWhenUserStopsBeingEligible`, troque `usersN(4)` por `usersN(2)` (os números 12, 50 e 24 continuam valendo para o rank D).

Em `TestLevelUpUsesMultipliedXP`, troque `usersN(4)` por `usersN(2)` e o comentário por `// Faltam 11 XP: 10 (sem buff) não passa de nível, 12 (rank D) passa.`

`TestBoostEndIsAnnouncedWhenCallDisappears` e `TestBoostIsPublishedBeforeXPIsSaved` não mudam (4 pessoas continuam com buff).

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /c/Users/Admin/orca/workspaces/concord/xp/backend
export GO="/c/Users/Admin/AppData/Local/Temp/claude/C--Users-Admin-orca-concord/0b965887-2e45-4c09-9a2e-e149f80567e6/scratchpad/go/bin/go.exe"
"$GO" test ./internal/level 2>&1 | tail -30
```
Expected: FAIL em `TestBoostPercentSteps`, `TestCallBoostsGroups…`, `TestBoostMultipliesXP`, `TestBoostEventOnlyWhenBuffed`… com valores antigos (ex.: `boostPercent(2) = 100, want 125`). Se falhar por erro de compilação, corrija o teste.

- [ ] **Step 3: Implementar**

Em `boost.go`, troque o comentário e a função (mantenha `callBoost` e `callBoosts`):

```go
// boostPercent é o multiplicador de XP (em %) de uma call com `eligible`
// pessoas ganhando XP: 100 = sem buff. Os degraus seguem o ranking de estilo
// do cliente: D (2), C (3), B (4), A (5), S (6–7), SS (8–9), SSS (10+).
func boostPercent(eligible int) int {
	switch {
	case eligible >= 10:
		return 400
	case eligible >= 8:
		return 300
	case eligible >= 6:
		return 250
	case eligible >= 5:
		return 200
	case eligible >= 4:
		return 175
	case eligible >= 3:
		return 150
	case eligible >= 2:
		return 125
	default:
		return 100
	}
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd /c/Users/Admin/orca/workspaces/concord/xp/backend
export GO="/c/Users/Admin/AppData/Local/Temp/claude/C--Users-Admin-orca-concord/0b965887-2e45-4c09-9a2e-e149f80567e6/scratchpad/go/bin/go.exe"
"$GO" test ./internal/level && "$GO" vet ./internal/level && "$GO" build ./...
```
Expected: `ok  gin-quickstart/backend/internal/level`, vet e build sem saída. Confira também `"$(dirname "$GO")/gofmt.exe" -l internal/level/boost.go` (se listar o arquivo só por CRLF, ignore).

- [ ] **Step 5: Commit**

```bash
cd /c/Users/Admin/orca/workspaces/concord/xp
git add backend/internal/level/boost.go backend/internal/level/boost_test.go backend/internal/level/service_test.go
git commit -m "feat(level): ranks D a SSS e teto de x4 no buff de XP de voz"
```

---

### Task 3: Frontend — 7 estágios em `lib/boost.ts` e CSS por estágio

**Files:**
- Modify: `frontend/src/renderer/src/features/levels/lib/boost.ts`
- Modify: `frontend/src/renderer/src/features/levels/lib/boost.test.ts`
- Modify: `frontend/src/renderer/src/features/levels/components/boost.css`
- Modify: `frontend/src/renderer/src/features/levels/store/boostStore.test.ts`
- Modify: `frontend/src/renderer/src/features/call/components/VoiceConnectedBadges.test.tsx`, `VoiceChannelView.test.tsx`

**Interfaces:**
- Produces (usado nas Tasks 4 e 5):
  - `type BoostStage = 1 | 2 | 3 | 4 | 5 | 6 | 7`
  - `BoostRank` ganha `letter: 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' | 'SSS'`, `shineMs: number` (volta do brilho da barra) e `embers: number` (brasas da barra)
  - `boostRank(percent): BoostRank | null` — limiares 125/150/175/200/250/300/400
  - `interface ActiveBoostBanner<T> { celebration: T; rank: BoostRank }`
  - `pickBoostBanner<T extends { callId: string; percent: number }>(stored: T | null, paused: boolean, currentCallId: string | null): ActiveBoostBanner<T> | null`

- [ ] **Step 1: Reescrever `boost.test.ts` (falha)**

```ts
import { describe, expect, it } from 'vitest'
import {
  PREVIEW_BOOST_CALL_ID,
  boostLabel,
  boostRank,
  pickBoostBanner,
  shouldPlayBoostBanner
} from './boost'

const PERCENTS = [125, 150, 175, 200, 250, 300, 400]

describe('boostRank', () => {
  it('sem buff abaixo de 125%', () => {
    expect(boostRank(100)).toBeNull()
    expect(boostRank(124)).toBeNull()
    expect(boostRank(0)).toBeNull()
  })

  it('mapeia o percentual para o rank estilo DMC', () => {
    expect(boostRank(125)).toMatchObject({ letter: 'D', text: 'Dope!', stage: 1 })
    expect(boostRank(150)).toMatchObject({ letter: 'C', text: 'Crazy!', stage: 2 })
    expect(boostRank(175)).toMatchObject({ letter: 'B', text: 'Blast!', stage: 3 })
    expect(boostRank(200)).toMatchObject({ letter: 'A', text: 'Alright!', stage: 4 })
    expect(boostRank(250)).toMatchObject({ letter: 'S', text: 'Sweet!', stage: 5 })
    expect(boostRank(300)).toMatchObject({ letter: 'SS', text: 'Showtime!', stage: 6 })
    expect(boostRank(400)).toMatchObject({ letter: 'SSS', text: "Smokin' Sexy Style!", stage: 7 })
  })

  it('em cada degrau o limite de baixo é do rank e o de cima ainda é do anterior', () => {
    const edges: [number, string][] = [
      [149, 'D'], [150, 'C'], [174, 'C'], [175, 'B'], [199, 'B'], [200, 'A'],
      [249, 'A'], [250, 'S'], [299, 'S'], [300, 'SS'], [399, 'SS'], [400, 'SSS']
    ]
    for (const [percent, letter] of edges) {
      expect(boostRank(percent)?.letter, `${percent}%`).toBe(letter)
    }
  })

  it('percentuais acima do teto continuam em SSS', () => {
    expect(boostRank(500)?.letter).toBe('SSS')
  })

  it('cada rank tem letra, texto, cor e estágio próprios', () => {
    const ranks = PERCENTS.map((p) => boostRank(p)!)
    expect(ranks.map((r) => r.stage)).toEqual([1, 2, 3, 4, 5, 6, 7])
    for (const key of ['letter', 'text', 'color'] as const) {
      expect(new Set(ranks.map((r) => r[key])).size).toBe(7)
    }
  })

  it('os ranks novos (D, C, B) só têm o slam da letra', () => {
    for (const p of [125, 150, 175]) {
      expect(boostRank(p)).toMatchObject({
        sparks: 0, ring: false, edgeFlash: false, quake: false,
        screenFlash: false, glitch: false, aura: false, embers: 0
      })
    }
  })

  it('a animação só cresce com o rank', () => {
    const ranks = PERCENTS.map((p) => boostRank(p)!)
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i].durationMs).toBeGreaterThan(ranks[i - 1].durationMs)
      expect(ranks[i].sparks).toBeGreaterThanOrEqual(ranks[i - 1].sparks)
      expect(ranks[i].embers).toBeGreaterThanOrEqual(ranks[i - 1].embers)
      expect(ranks[i].shineMs).toBeLessThan(ranks[i - 1].shineMs)
    }
    expect(ranks.map((r) => r.durationMs)).toEqual([900, 1000, 1100, 1200, 1600, 2000, 2500])
    expect(ranks.map((r) => r.edgeFlash)).toEqual([false, false, false, false, true, true, true])
    expect(ranks.map((r) => r.ring)).toEqual([false, false, false, false, false, true, true])
    expect(ranks.map((r) => r.embers)).toEqual([0, 0, 0, 0, 0, 4, 7])
    for (const flag of ['screenFlash', 'quake', 'glitch', 'aura'] as const) {
      expect(ranks.map((r) => r[flag])).toEqual([false, false, false, false, false, false, true])
    }
  })

  it('o brilho da barra de A a SSS mantém os tempos de antes (2,0 s a 0,8 s)', () => {
    expect([200, 250, 300, 400].map((p) => boostRank(p)!.shineMs)).toEqual([2000, 1600, 1200, 800])
  })
})

describe('boostLabel', () => {
  it('formata o multiplicador', () => {
    expect(PERCENTS.map(boostLabel)).toEqual([
      'x1.25', 'x1.5', 'x1.75', 'x2.0', 'x2.5', 'x3.0', 'x4.0'
    ])
  })
})

describe('shouldPlayBoostBanner', () => {
  it('toca só na call do buff e sem mute/surdez', () => {
    expect(shouldPlayBoostBanner(false, 'c1', 'c1')).toBe(true)
    expect(shouldPlayBoostBanner(false, 'c1', 'c2')).toBe(false)
    expect(shouldPlayBoostBanner(false, 'c1', null)).toBe(false)
    expect(shouldPlayBoostBanner(true, 'c1', 'c1')).toBe(false)
  })

  it('a prévia de dev toca em qualquer lugar, menos pausado', () => {
    expect(shouldPlayBoostBanner(false, PREVIEW_BOOST_CALL_ID, null)).toBe(true)
    expect(shouldPlayBoostBanner(true, PREVIEW_BOOST_CALL_ID, null)).toBe(false)
  })
})

describe('pickBoostBanner', () => {
  const stored = { callId: 'c1', percent: 175, eligible: 4, key: 1 }

  it('devolve a celebração com o rank quando ela vale para mim', () => {
    const picked = pickBoostBanner(stored, false, 'c1')
    expect(picked?.celebration).toBe(stored)
    expect(picked?.rank.letter).toBe('B')
  })

  it('não devolve nada sem celebração, em outra call, mutado/surdo ou sem rank', () => {
    expect(pickBoostBanner(null, false, 'c1')).toBeNull()
    expect(pickBoostBanner(stored, false, 'c2')).toBeNull()
    expect(pickBoostBanner(stored, true, 'c1')).toBeNull()
    expect(pickBoostBanner({ ...stored, percent: 100 }, false, 'c1')).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /c/Users/Admin/orca/workspaces/concord/xp/frontend
npx vitest run src/renderer/src/features/levels/lib/boost.test.ts 2>&1 | tail -25
```
Expected: FAIL (`pickBoostBanner is not a function`, `letter: 'D'` ausente).

- [ ] **Step 3: Implementar `boost.ts`**

Substitua o conteúdo de `lib/boost.ts` por:

```ts
/**
 * Buff de XP de voz por pessoas na call. O backend manda só o percentual
 * (100 = sem buff); aqui ele vira o rank no estilo do ranking de estilo do
 * Devil May Cry (só letra e texto, nada de fonte/logo/arte do jogo) e as
 * flags do que a animação mostra: cada rank soma efeitos ao anterior.
 */
export type BoostStage = 1 | 2 | 3 | 4 | 5 | 6 | 7

export interface BoostRank {
  letter: 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' | 'SSS'
  text: string
  /** "x1.25" */
  label: string
  stage: BoostStage
  /** Cor principal da letra, brilho e faíscas. */
  color: string
  /** Contorno/sombra da letra. */
  accent: string
  /** Quanto o banner de ativação fica na tela. */
  durationMs: number
  /** Faíscas soltas pelo banner. */
  sparks: number
  /** Onda de choque (anel) atrás da letra. */
  ring: boolean
  /** Flash vermelho/dourado nas bordas da janela. */
  edgeFlash: boolean
  /** A janela inteira treme no slam. */
  quake: boolean
  /** Flash de tela cheia. */
  screenFlash: boolean
  /** Glitch periódico na letra. */
  glitch: boolean
  /** Aura pulsante no cabeçalho do canal de voz. */
  aura: boolean
  /** Tempo de uma volta do brilho que corre pela barra de XP (menor = mais rápido). */
  shineMs: number
  /** Brasas que sobem da barra de XP. */
  embers: number
}

/** Sem nenhum efeito: os ranks D, C, B e A só somam o que mudam. */
const NO_FX = {
  sparks: 0,
  ring: false,
  edgeFlash: false,
  quake: false,
  screenFlash: false,
  glitch: false,
  aura: false,
  embers: 0
} as const

const RANKS: Record<BoostStage, Omit<BoostRank, 'label'>> = {
  1: {
    ...NO_FX,
    letter: 'D',
    text: 'Dope!',
    stage: 1,
    color: '#94a3b8',
    accent: '#334155',
    durationMs: 900,
    shineMs: 3200
  },
  2: {
    ...NO_FX,
    letter: 'C',
    text: 'Crazy!',
    stage: 2,
    color: '#60a5fa',
    accent: '#1e3a8a',
    durationMs: 1000,
    shineMs: 2800
  },
  3: {
    ...NO_FX,
    letter: 'B',
    text: 'Blast!',
    stage: 3,
    color: '#2dd4bf',
    accent: '#115e59',
    durationMs: 1100,
    shineMs: 2400
  },
  4: {
    ...NO_FX,
    letter: 'A',
    text: 'Alright!',
    stage: 4,
    color: '#ef4444',
    accent: '#7f1d1d',
    durationMs: 1200,
    shineMs: 2000
  },
  5: {
    ...NO_FX,
    letter: 'S',
    text: 'Sweet!',
    stage: 5,
    color: '#f87171',
    accent: '#b91c1c',
    durationMs: 1600,
    edgeFlash: true,
    shineMs: 1600
  },
  6: {
    ...NO_FX,
    letter: 'SS',
    text: 'Showtime!',
    stage: 6,
    color: '#fb923c',
    accent: '#b45309',
    durationMs: 2000,
    sparks: 12,
    ring: true,
    edgeFlash: true,
    shineMs: 1200,
    embers: 4
  },
  7: {
    ...NO_FX,
    letter: 'SSS',
    text: "Smokin' Sexy Style!",
    stage: 7,
    color: '#fde047',
    accent: '#b45309',
    durationMs: 2500,
    sparks: 22,
    ring: true,
    edgeFlash: true,
    quake: true,
    screenFlash: true,
    glitch: true,
    aura: true,
    shineMs: 800,
    embers: 7
  }
}

/** Percentual mínimo de cada rank, do maior para o menor. */
const THRESHOLDS: ReadonlyArray<readonly [number, BoostStage]> = [
  [400, 7],
  [300, 6],
  [250, 5],
  [200, 4],
  [175, 3],
  [150, 2],
  [125, 1]
]

export function boostLabel(percent: number): string {
  const multiplier = percent / 100
  return `x${Number.isInteger(multiplier) ? multiplier.toFixed(1) : multiplier}`
}

/** Rank do buff, ou null quando não há buff (menos de 125%). */
export function boostRank(percent: number): BoostRank | null {
  const hit = THRESHOLDS.find(([min]) => percent >= min)
  if (!hit) return null
  return { ...RANKS[hit[1]], label: boostLabel(percent) }
}

/** Call fictícia da prévia de dev (`__salinhaBoost`) quando você não está em call. */
export const PREVIEW_BOOST_CALL_ID = 'preview'

/**
 * O banner de ativação só toca para quem está na call do buff e não está
 * mutado/surdo (quem está pausado não ganha o buff, então não comemora).
 */
export function shouldPlayBoostBanner(
  paused: boolean,
  celebrationCallId: string,
  currentCallId: string | null
): boolean {
  if (paused) return false
  return celebrationCallId === PREVIEW_BOOST_CALL_ID || celebrationCallId === currentCallId
}

/** A celebração do store junto com o rank dela. */
export interface ActiveBoostBanner<T> {
  celebration: T
  rank: BoostRank
}

/**
 * A celebração guardada no store junto com o rank dela, ou null quando o
 * banner (e o som) não devem tocar para mim agora.
 */
export function pickBoostBanner<T extends { callId: string; percent: number }>(
  stored: T | null,
  paused: boolean,
  currentCallId: string | null
): ActiveBoostBanner<T> | null {
  if (!stored || !shouldPlayBoostBanner(paused, stored.callId, currentCallId)) return null
  const rank = boostRank(stored.percent)
  return rank ? { celebration: stored, rank } : null
}
```

- [ ] **Step 4: Renumerar os estágios no CSS**

Em `features/levels/components/boost.css` (edições de uma linha cada, com a ferramenta Edit; o arquivo pode estar em CRLF, então não use `old_string` com quebra de linha):

| De | Para |
|---|---|
| `.boost-letter[data-stage='4'] {` | `.boost-letter[data-stage='7'] {` |
| `.boost-letter[data-stage='3'] {` | `.boost-letter[data-stage='6'] {` |
| `.boost-letter[data-stage='2'] {` | `.boost-letter[data-stage='5'] {` |
| `/* --- Buff de XP de voz (ranks A/S/SS/SSS; ver lib/boost.ts) --- */` | `/* --- Buff de XP de voz (ranks D a SSS; ver lib/boost.ts) --- */` |

Faça nessa ordem (4→7 antes de 3→6 antes de 2→5) para não sobrescrever. Depois confira: `grep -n "data-stage" features/levels/components/boost.css` deve listar `'5'`, `'6'`, `'7'` e o seletor genérico `[data-stage]` do `prefers-reduced-motion`. Outros comentários do CSS dizem "SS e SSS", "SS+", "S+" e "SSS": continuam certos, porque S, SS e SSS são os mesmos ranks.

- [ ] **Step 5: Ajustar os testes que dependiam dos percentuais antigos**

`boostStore.test.ts`: troque os testes abaixo (os demais ficam como estão) e acrescente o da escada completa:

```ts
  it('heartbeat no mesmo rank, ou o buff mudando dentro do rank, não celebra de novo', () => {
    boost('c1', 400, 10)
    vi.advanceTimersByTime(boostRank(400)!.durationMs)
    boost('c1', 400, 10) // heartbeat
    boost('c1', 400, 12) // 12 pessoas ainda é SSS
    expect(useBoostStore.getState().celebration).toBeNull()
  })

  it('descer de rank não celebra', () => {
    boost('c1', 400, 10)
    vi.advanceTimersByTime(boostRank(400)!.durationMs)
    boost('c1', 250, 6)
    expect(useBoostStore.getState().celebration).toBeNull()
    expect(useBoostStore.getState().byCall.c1?.percent).toBe(250)
  })

  it('subindo D, C, B, A, S, SS e SSS, cada degrau celebra uma vez', () => {
    const ladder = [125, 150, 175, 200, 250, 300, 400]
    let lastKey = 0
    ladder.forEach((percent, i) => {
      boost('c1', percent, i + 2)
      const celebration = useBoostStore.getState().celebration
      expect(celebration, `${percent}%`).toMatchObject({ callId: 'c1', percent })
      expect(celebration!.key).toBeGreaterThan(lastKey)
      lastKey = celebration!.key
      boost('c1', percent, i + 2) // heartbeat no mesmo degrau: não repete
      expect(useBoostStore.getState().celebration!.key).toBe(lastKey)
    })
  })
```
No teste `'a prévia (dev) liga o buff e a celebração'` nada muda (175 continua rank B). Nos testes que usam `boostRank(125)!.durationMs`, nada muda (125 é o D agora, e o tempo vem do rank).

`VoiceConnectedBadges.test.tsx`: no primeiro teste use `boost.percent = 300`, `not.toContain('Showtime!')` e `not.toContain('XP x3.0')`; no segundo use `boost.percent = 400` (a aura agora só existe no SSS). Se o teste de "sem buff" ficar igual, deixe.

`VoiceChannelView.test.tsx`: nas linhas com `boost: 200` (a do `call.state = {...}` em torno da linha 114 e a do estado "conectado e mudo" em torno da 129) troque por `boost: 400`.

- [ ] **Step 6: Rodar e ver passar**

```bash
cd /c/Users/Admin/orca/workspaces/concord/xp/frontend
npx vitest run src/renderer/src/features/levels src/renderer/src/features/call/components/VoiceConnectedBadges.test.tsx src/renderer/src/features/call/components/VoiceChannelView.test.tsx 2>&1 | tail -15
npx --yes yarn@1.22.22 typecheck 2>&1 | tail -15
```
Expected: tudo verde. O typecheck pode acusar `VoiceXPBar.tsx` (`rank.stage === 3`/`>= 3` ainda compilam, pois `stage` é número); se acusar, é sinal de que mexi no tipo errado: pare e investigue.

- [ ] **Step 7: Commit**

```bash
cd /c/Users/Admin/orca/workspaces/concord/xp
git add frontend/src/renderer/src/features/levels/lib/boost.ts frontend/src/renderer/src/features/levels/lib/boost.test.ts frontend/src/renderer/src/features/levels/components/boost.css frontend/src/renderer/src/features/levels/store/boostStore.test.ts frontend/src/renderer/src/features/call/components/VoiceConnectedBadges.test.tsx frontend/src/renderer/src/features/call/components/VoiceChannelView.test.tsx
git commit -m "feat(levels): ranks D, C e B e teto de x4 no cliente"
```

---

### Task 4: `VoiceXPBar` em componentes pequenos (CRAP 182 → ≤ 15)

**Files:**
- Create: `frontend/src/renderer/src/features/levels/lib/boostBar.ts` + `boostBar.test.ts`
- Create: `components/BoostShine.tsx`, `components/BoostEmbers.tsx`, `components/XpProgressBar.tsx`
- Modify: `components/VoiceXPBar.tsx`
- Test: `components/VoiceXPBar.test.tsx` (novo)

**Interfaces:**
- Consumes: `BoostRank.shineMs`, `BoostRank.embers`, `BoostRank.color` (Task 3).
- Produces: `emberLayout(count: number): { left: string; dx: number; delay: number }[]`; `xpFillStyle(tier: { accent: string; color: string }, paused: boolean): CSSProperties`.

- [ ] **Step 1: Testes da lib (falham)** — `lib/boostBar.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { emberLayout, xpFillStyle } from './boostBar'

describe('xpFillStyle', () => {
  const tier = { accent: '#111111', color: '#eeeeee' }

  it('sem pausa: gradiente do tier e brilho', () => {
    expect(xpFillStyle(tier, false)).toEqual({
      backgroundImage: 'linear-gradient(90deg, #111111, #eeeeee)',
      boxShadow: '0 0 8px #eeeeee88'
    })
  })

  it('pausado: cinza e sem brilho', () => {
    expect(xpFillStyle(tier, true)).toEqual({
      backgroundImage: 'linear-gradient(90deg, #4b5563, #374151)'
    })
  })
})

describe('emberLayout', () => {
  it('uma brasa por contagem, espalhadas entre 10% e 90% da barra', () => {
    const embers = emberLayout(7)
    expect(embers).toHaveLength(7)
    for (const e of embers) {
      const left = parseFloat(e.left)
      expect(left).toBeGreaterThanOrEqual(10)
      expect(left).toBeLessThan(90)
    }
  })

  it('alterna o lado do desvio e escalona o atraso', () => {
    const [first, second, third] = emberLayout(3)
    expect(first.dx).toBeGreaterThan(0)
    expect(second.dx).toBeLessThan(0)
    expect(third.dx).toBeGreaterThan(0)
    expect([first.delay, second.delay, third.delay]).toEqual([0, 230, 460])
  })

  it('zero brasas, lista vazia', () => {
    expect(emberLayout(0)).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/renderer/src/features/levels/lib/boostBar.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 3: Implementar** — `lib/boostBar.ts`:

```ts
import type { CSSProperties } from 'react'

/** Cores do tier do nível usadas no preenchimento da barra. */
export interface XpTierColors {
  accent: string
  color: string
}

/** Preenchimento da barra de XP: cinza e sem brilho quando o XP está pausado. */
export function xpFillStyle(tier: XpTierColors, paused: boolean): CSSProperties {
  if (paused) return { backgroundImage: 'linear-gradient(90deg, #4b5563, #374151)' }
  return {
    backgroundImage: `linear-gradient(90deg, ${tier.accent}, ${tier.color})`,
    boxShadow: `0 0 8px ${tier.color}88`
  }
}

export interface Ember {
  /** Posição horizontal na barra. */
  left: string
  /** Desvio lateral da brasa ao subir, em px. */
  dx: number
  /** Atraso do início da animação, em ms. */
  delay: number
}

/** Posições das brasas que sobem da barra: espalhadas e sem aleatoriedade. */
export function emberLayout(count: number): Ember[] {
  return Array.from({ length: count }, (_, i) => ({
    left: `${10 + ((i * 53) % 80)}%`,
    dx: (i % 2 === 0 ? 1 : -1) * (3 + ((i * 7) % 8)),
    delay: i * 230
  }))
}
```

- [ ] **Step 4: Rodar e ver passar** — o mesmo comando, verde.

- [ ] **Step 5: Teste do componente (falha)** — `components/VoiceXPBar.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const state = vi.hoisted(() => ({
  me: null as null | { level: number; xp_into_level: number; xp_for_next: number; voice_seconds: number },
  boost: 100
}))
vi.mock('../store/levelStore', () => ({
  useLevelStore: <T,>(pick: (s: { me: typeof state.me }) => T): T => pick({ me: state.me })
}))
vi.mock('../hooks/useMyBoost', () => ({ useMyBoostPercent: () => state.boost }))

import VoiceXPBar from './VoiceXPBar'

const render = (paused = false): string => renderToStaticMarkup(<VoiceXPBar paused={paused} />)
const count = (html: string, needle: string): number => html.split(needle).length - 1

describe('VoiceXPBar', () => {
  beforeEach(() => {
    state.me = { level: 12, xp_into_level: 40, xp_for_next: 100, voice_seconds: 3600 }
    state.boost = 100
  })

  it('sem dados do usuário, não desenha nada', () => {
    state.me = null
    expect(render()).toBe('')
  })

  it('sem buff: nível e XP, sem rank, brilho nem brasas', () => {
    const html = render()
    expect(html).toContain('Nível 12')
    expect(html).toContain('40/100 XP')
    expect(html).not.toContain('boost-letter')
    expect(html).not.toContain('boost-shine')
    expect(html).not.toContain('boost-ember')
  })

  it.each([
    [125, 'D', 'Dope!', 'x1.25'],
    [150, 'C', 'Crazy!', 'x1.5'],
    [175, 'B', 'Blast!', 'x1.75'],
    [200, 'A', 'Alright!', 'x2.0']
  ])('%i%%: rank %s com brilho e sem brasas', (percent, _letter, text, label) => {
    state.boost = percent
    const html = render()
    expect(html).toContain(text)
    expect(html).toContain(label)
    expect(count(html, 'boost-shine')).toBe(1)
    expect(count(html, 'boost-ember ')).toBe(0)
  })

  it('SS solta 4 brasas e SSS solta 7', () => {
    state.boost = 300
    expect(count(render(), 'boost-ember ')).toBe(4)
    state.boost = 400
    expect(count(render(), 'boost-ember ')).toBe(7)
  })

  it('o brilho acompanha o rank', () => {
    state.boost = 125
    expect(render()).toContain('--boost-shine-ms:3200ms')
    state.boost = 400
    expect(render()).toContain('--boost-shine-ms:800ms')
  })

  it('pausado: texto de pausa, rank apagado, sem brilho nem brasas', () => {
    state.boost = 400
    const html = render(true)
    expect(html).toContain('XP pausado (mutado)')
    expect(html).toContain('data-paused="true"')
    expect(html).not.toContain('boost-shine')
    expect(html).not.toContain('boost-ember')
  })
})
```
Run: `npx vitest run src/renderer/src/features/levels/components/VoiceXPBar.test.tsx`. Expected: o teste de `SS/SSS` e o de `--boost-shine-ms:3200ms` FALHAM com o `VoiceXPBar` atual (fórmula antiga `2400 - stage * 400` dá valores errados e `stage >= 3` solta brasas em B). Os demais podem passar; o importante é ver ao menos esses falharem pelo motivo certo.

- [ ] **Step 6: Implementar os componentes**

`components/BoostShine.tsx`:
```tsx
import type { CSSProperties } from 'react'
import './boost.css'

/** Brilho que corre pelo preenchimento da barra de XP enquanto há buff. */
function BoostShine({ shineMs }: { shineMs: number }): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="boost-shine boost-motion absolute inset-y-0 w-1/4"
      style={{ '--boost-shine-ms': `${shineMs}ms` } as CSSProperties}
    />
  )
}

export default BoostShine
```

`components/BoostEmbers.tsx`:
```tsx
import type { CSSProperties } from 'react'
import { emberLayout } from '../lib/boostBar'
import './boost.css'

/** Brasas que sobem da barra de XP nos ranks SS e SSS. */
function BoostEmbers({ color, count }: { color: string; count: number }): React.JSX.Element {
  return (
    <>
      {emberLayout(count).map((ember, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="boost-ember boost-motion pointer-events-none absolute -top-0.5 h-[3px] w-[3px] rounded-full"
          style={
            {
              left: ember.left,
              background: color,
              boxShadow: `0 0 4px ${color}`,
              '--dx': `${ember.dx}px`,
              '--delay': `${ember.delay}ms`
            } as CSSProperties
          }
        />
      ))}
    </>
  )
}

export default BoostEmbers
```

`components/XpProgressBar.tsx`:
```tsx
import type { BoostRank } from '../lib/boost'
import { type XpTierColors, xpFillStyle } from '../lib/boostBar'
import BoostEmbers from './BoostEmbers'
import BoostShine from './BoostShine'

interface XpProgressBarProps {
  percent: number
  tier: XpTierColors
  paused: boolean
  rank: BoostRank | null
}

/** Trilho da barra de XP; com buff (e sem pausa) leva o brilho e as brasas do rank. */
function XpProgressBar({ percent, tier, paused, rank }: XpProgressBarProps): React.JSX.Element {
  const fx = paused ? null : rank
  return (
    <div className="relative">
      <div className="h-1.5 overflow-hidden rounded-full bg-fg/10">
        <div
          className="relative h-full overflow-hidden rounded-full transition-[width] duration-700"
          style={{ width: `${percent}%`, ...xpFillStyle(tier, paused) }}
        >
          {fx && <BoostShine shineMs={fx.shineMs} />}
        </div>
      </div>
      {fx && <BoostEmbers color={fx.color} count={fx.embers} />}
    </div>
  )
}

export default XpProgressBar
```

`components/VoiceXPBar.tsx` (substitui o arquivo; remove o `import './boost.css'` que a Task 1 pôs aqui, pois as classes agora estão nos filhos):
```tsx
import { useLevelStore } from '../store/levelStore'
import { boostRank } from '../lib/boost'
import StyleRank from './StyleRank'
import XpProgressBar from './XpProgressBar'
import { useMyBoostPercent } from '../hooks/useMyBoost'
import { formatVoiceTime, levelPercent, levelTier, minutesToNext } from '../lib/levels'

/** Barra de XP de quem está logado, no painel "Voz conectada". */
function VoiceXPBar({ paused }: { paused: boolean }): React.JSX.Element | null {
  const me = useLevelStore((s) => s.me)
  const boostPercent = useMyBoostPercent()
  if (!me) return null

  const rank = boostRank(boostPercent)
  const tier = levelTier(me.level)
  const percent = levelPercent(me.xp_into_level, me.xp_for_next)
  const minutes = minutesToNext(me.xp_into_level, me.xp_for_next)

  return (
    <div
      className="mt-2 px-0.5"
      title={`${formatVoiceTime(me.voice_seconds)} de call no total · faltam ~${minutes} min para o nível ${me.level + 1}`}
    >
      {rank && <StyleRank percent={boostPercent} paused={paused} className="mb-1" />}
      <div className="mb-1 flex items-baseline justify-between text-[10px]">
        <span className="font-bold" style={{ color: paused ? 'var(--text-faint)' : tier.color }}>
          Nível {me.level}
        </span>
        <span className="text-gray-500">
          {paused ? 'XP pausado (mutado)' : `${me.xp_into_level}/${me.xp_for_next} XP`}
        </span>
      </div>
      <XpProgressBar percent={percent} tier={tier} paused={paused} rank={rank} />
    </div>
  )
}

export default VoiceXPBar
```
(Se o `title` original tinha o texto idêntico, mantenha exatamente o que estava no arquivo antes; copie do `git show HEAD:...` em caso de dúvida.)

- [ ] **Step 7: Rodar e ver passar**

```bash
cd /c/Users/Admin/orca/workspaces/concord/xp/frontend
npx vitest run src/renderer/src/features/levels 2>&1 | tail -12
npx --yes yarn@1.22.22 typecheck 2>&1 | tail -10
cd .. && node scripts/crap.mjs --files frontend/src/renderer/src/features/levels/components/VoiceXPBar.tsx frontend/src/renderer/src/features/levels/components/XpProgressBar.tsx frontend/src/renderer/src/features/levels/components/BoostShine.tsx frontend/src/renderer/src/features/levels/components/BoostEmbers.tsx frontend/src/renderer/src/features/levels/lib/boostBar.ts 2>&1 | tail -20
```
Expected: testes verdes, typecheck limpo, CRAP de todas as funções ≤ 15 (o `VoiceXPBar` sai de 182).

- [ ] **Step 8: Commit**

```bash
cd /c/Users/Admin/orca/workspaces/concord/xp
git add frontend/src/renderer/src/features/levels/lib/boostBar.ts frontend/src/renderer/src/features/levels/lib/boostBar.test.ts frontend/src/renderer/src/features/levels/components/BoostShine.tsx frontend/src/renderer/src/features/levels/components/BoostEmbers.tsx frontend/src/renderer/src/features/levels/components/XpProgressBar.tsx frontend/src/renderer/src/features/levels/components/VoiceXPBar.tsx frontend/src/renderer/src/features/levels/components/VoiceXPBar.test.tsx
git commit -m "refactor(levels): quebra a barra de XP de voz e leva brilho e brasas para os dados do rank"
```

---

### Task 5: Sons dos ranks e `BoostBanner` em peças pequenas (CRAP 132 → ≤ 15)

**Files:**
- Modify: `frontend/src/renderer/src/features/call/lib/sounds.ts` (só 4 `export`)
- Create: `lib/boostSounds.ts` + `.test.ts`, `lib/boostSparks.ts` + `.test.ts`, `lib/boostQuake.ts` + `.test.ts`
- Create: `hooks/useBoostBanner.ts`, `hooks/useBoostEffects.ts`
- Create: `components/BoostBannerView.tsx`, `BoostBannerEffects.tsx`, `BoostSparks.tsx` (+ testes)
- Modify: `components/BoostBanner.tsx`

**Interfaces:**
- Consumes: `pickBoostBanner`, `BoostRank` (Task 3); de `call/lib/sounds`: `Note`, `soft`, `glide`, `chord`, `run`, `playNotes`, `oncePerKey`, `BASE_VOLUME`, `peakVolume`.
- Produces: `BOOST_SOUNDS: Record<BoostStage, Note[]>`, `playBoostSound(stage)`, `playBoostCelebration(key, stage)`, `sparkLayout(count)`, `startQuake(durationMs?)`.

- [ ] **Step 1: Exportar os auxiliares de `sounds.ts`**

Em `call/lib/sounds.ts` troque, linha a linha (Edit com a linha de declaração):
- `const soft = (` → `export const soft = (`
- `const glide = (` → `export const glide = (`
- `const chord = (` → `export const chord = (`
- `const run = (` → `export const run = (`

Rode `npx vitest run src/renderer/src/features/call/lib/sounds.test.ts` (verde, nada mudou) e `git diff --stat` (4 linhas). O arquivo continua com 388 + 0 linhas.

- [ ] **Step 2: Testes dos sons (falham)** — `lib/boostSounds.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../call/lib/sounds', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../call/lib/sounds')>()),
  playNotes: vi.fn()
}))

import { BASE_VOLUME, peakVolume, playNotes } from '../../call/lib/sounds'
import { boostRank } from './boost'
import { BOOST_SOUNDS, playBoostCelebration, playBoostSound } from './boostSounds'

const STAGES = [1, 2, 3, 4, 5, 6, 7] as const
const PERCENT_OF_STAGE = [125, 150, 175, 200, 250, 300, 400]
const end = (stage: (typeof STAGES)[number]): number =>
  Math.max(...BOOST_SOUNDS[stage].map((n) => n.at + n.duration))

describe('BOOST_SOUNDS', () => {
  it('tem um som por rank', () => {
    for (const stage of STAGES) expect(BOOST_SOUNDS[stage].length, `estágio ${stage}`).toBeGreaterThan(0)
  })

  it('o som só cresce: cada rank dura mais que o anterior', () => {
    for (let i = 1; i < STAGES.length; i++) {
      expect(end(STAGES[i])).toBeGreaterThan(end(STAGES[i - 1]))
    }
  })

  it('fica abaixo das vozes: pico dentro do teto dos jingles de nível', () => {
    for (const stage of STAGES) {
      const peak = peakVolume(BOOST_SOUNDS[stage])
      expect(peak, `estágio ${stage}`).toBeGreaterThan(0)
      expect(peak, `estágio ${stage}`).toBeLessThanOrEqual(0.8 * BASE_VOLUME)
    }
  })

  it('cada som cabe na duração do banner do rank', () => {
    STAGES.forEach((stage, i) => {
      const rank = boostRank(PERCENT_OF_STAGE[i])!
      expect(end(stage) * 1000, `estágio ${stage}`).toBeLessThan(rank.durationMs)
    })
  })

  it('toda nota tem frequência, início e duração válidos', () => {
    for (const stage of STAGES) {
      for (const note of BOOST_SOUNDS[stage]) {
        expect(note.freq).toBeGreaterThan(0)
        expect(note.at).toBeGreaterThanOrEqual(0)
        expect(note.duration).toBeGreaterThan(0)
      }
    }
  })
})

describe('playBoostSound', () => {
  beforeEach(() => vi.mocked(playNotes).mockClear())

  it('toca as notas do estágio no grupo dos sons de nível (um corta o outro)', () => {
    playBoostSound(5)
    expect(playNotes).toHaveBeenCalledWith(BOOST_SOUNDS[5], { level: true })
  })
})

describe('playBoostCelebration', () => {
  beforeEach(() => vi.mocked(playNotes).mockClear())

  it('toca uma vez por celebração, mesmo se o efeito rodar duas vezes (StrictMode)', () => {
    playBoostCelebration(9001, 3)
    playBoostCelebration(9001, 3)
    expect(playNotes).toHaveBeenCalledTimes(1)
  })

  it('uma celebração nova toca de novo', () => {
    playBoostCelebration(9002, 1)
    playBoostCelebration(9003, 2)
    expect(playNotes).toHaveBeenCalledTimes(2)
    expect(playNotes).toHaveBeenLastCalledWith(BOOST_SOUNDS[2], { level: true })
  })
})
```
Run → FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `lib/boostSounds.ts`**

```ts
import {
  type Note,
  chord,
  glide,
  oncePerKey,
  playNotes,
  run,
  soft
} from '../../call/lib/sounds'
import type { BoostStage } from './boost'

/**
 * Stingers do buff de XP, um por rank (D a SSS), todos sintetizados e em lá
 * maior. Cada rank soma uma camada ao anterior: tics, arpejo, impacto grave,
 * power chord, riff, acorde aberto e, no SSS, impacto duplo e cintilar final.
 * Duram menos que o banner do rank e ficam abaixo das vozes (ver
 * boostSounds.test.ts).
 */

// Notas (Hz).
const A2 = 110
const A3 = 220
const E4 = 329.63
const A4 = 440
const Cs5 = 554.37
const E5 = 659.25
const A5 = 880
const Cs6 = 1108.73
const E6 = 1318.51
const A6 = 1760
const E7 = 2637.02

export const BOOST_SOUNDS: Record<BoostStage, Note[]> = {
  // D: dois "tics" subindo.
  1: [...run([A4, Cs5], 0, 0.1, 0.14, 0.35, 'triangle')],
  // C: três notas subindo.
  2: [...run([A4, Cs5], 0, 0.1, 0.14, 0.3, 'triangle'), soft(E5, 0.2, 0.2, 0.35, 'triangle')],
  // B: arpejo de quatro notas e um acorde curto.
  3: [
    ...run([A4, Cs5, E5, A5], 0, 0.08, 0.12, 0.28, 'triangle'),
    ...chord([A5, E6], 0.34, 0.26, 0.2, 'triangle')
  ],
  // A: impacto grave e power chord, com uma nota alta no fim.
  4: [
    glide(150, 50, 0, 0.35, 0.3),
    ...chord([A3, E4], 0.05, 0.5, 0.12, 'square'),
    soft(A5, 0.35, 0.45, 0.22, 'triangle')
  ],
  // S: impacto mais forte, power chord, subida rápida e acorde.
  5: [
    glide(130, 45, 0, 0.45, 0.35),
    ...chord([A3, E4], 0.05, 0.55, 0.13, 'square'),
    ...run([A4, Cs5, E5, A5], 0.45, 0.07, 0.1, 0.22, 'triangle'),
    ...chord([A5, E6], 0.76, 0.34, 0.2, 'triangle')
  ],
  // SS: impacto, riff de cinco notas, acorde aberto longo e brilho agudo.
  6: [
    glide(120, 40, 0, 0.5, 0.35),
    ...chord([A3, E4], 0.05, 0.6, 0.13, 'square'),
    ...run([A4, Cs5, E5, A5, Cs6], 0.5, 0.07, 0.1, 0.2, 'triangle'),
    ...chord([A4, E5, A5, Cs6], 0.9, 0.6, 0.12, 'triangle'),
    soft(E7, 1.1, 0.4, 0.08)
  ],
  // SSS: impacto duplo, riff de seis notas, acorde grande com grave e cintilar.
  7: [
    glide(130, 45, 0, 0.4, 0.3),
    glide(110, 35, 0.3, 0.5, 0.3),
    ...chord([A3, E4], 0.4, 0.6, 0.13, 'square'),
    ...run([A4, Cs5, E5, A5, Cs6, E6], 0.75, 0.07, 0.1, 0.18, 'triangle'),
    ...chord([A4, E5, A5, Cs6], 1.25, 0.9, 0.12, 'triangle'),
    soft(A2, 1.25, 0.9, 0.12),
    ...run([E7, A6, E7, A6], 1.5, 0.12, 0.18, 0.05)
  ]
}

/** Toca o stinger do rank. `level: true`: um rank novo corta o anterior, sem sobrepor. */
export function playBoostSound(stage: BoostStage): void {
  playNotes(BOOST_SOUNDS[stage], { level: true })
}

const firstPlay = oncePerKey()

/** Toca o som da celebração uma única vez (o StrictMode repete efeitos em dev). */
export function playBoostCelebration(key: number, stage: BoostStage): void {
  if (firstPlay(key)) playBoostSound(stage)
}
```

Run `npx vitest run src/renderer/src/features/levels/lib/boostSounds.test.ts`. Se o teste de pico falhar para algum rank, **baixe os `share` das notas que se sobrepõem nesse rank** (nunca o teto do teste) e rode de novo; se a duração não fechar (ordem crescente ou menor que o banner), ajuste `duration` das últimas notas.

- [ ] **Step 4: Faíscas e tremida (puros)** — `lib/boostSparks.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { sparkLayout } from './boostSparks'

describe('sparkLayout', () => {
  it('uma faísca por contagem, sem aleatoriedade', () => {
    expect(sparkLayout(12)).toHaveLength(12)
    expect(sparkLayout(12)).toEqual(sparkLayout(12))
  })

  it('sem faíscas, lista vazia', () => {
    expect(sparkLayout(0)).toEqual([])
  })

  it('espalha em ângulos diferentes, com tamanho de 3 a 5 px e atrasos de 120 a 280 ms', () => {
    const sparks = sparkLayout(22)
    expect(new Set(sparks.map((s) => `${s.dx.toFixed(1)},${s.dy.toFixed(1)}`)).size).toBe(22)
    for (const s of sparks) {
      expect(s.size).toBeGreaterThanOrEqual(3)
      expect(s.size).toBeLessThanOrEqual(5)
      expect(s.delay).toBeGreaterThanOrEqual(120)
      expect(s.delay).toBeLessThanOrEqual(280)
    }
  })
})
```
`lib/boostSparks.ts` (a mesma conta que estava dentro do `useMemo` do `BoostBanner`):
```ts
export interface Spark {
  dx: number
  dy: number
  size: number
  delay: number
}

/** Posições das faíscas que estouram do banner: espalhadas em leque, sem aleatoriedade. */
export function sparkLayout(count: number): Spark[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = ((i / Math.max(1, count)) * 360 + (i % 2) * 11) * (Math.PI / 180)
    const reach = 70 + ((i * 37) % 70)
    return {
      dx: Math.cos(angle) * reach,
      dy: Math.sin(angle) * reach * 0.6,
      size: 3 + (i % 3),
      delay: 120 + (i % 5) * 40
    }
  })
}
```
`lib/boostQuake.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startQuake } from './boostQuake'

describe('startQuake', () => {
  const classes = new Set<string>()

  beforeEach(() => {
    vi.useFakeTimers()
    classes.clear()
    vi.stubGlobal('document', {
      body: {
        classList: {
          add: (c: string) => classes.add(c),
          remove: (c: string) => classes.delete(c)
        }
      }
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('treme a janela e para sozinho depois de 600 ms', () => {
    startQuake()
    expect(classes.has('boost-quake')).toBe(true)
    vi.advanceTimersByTime(599)
    expect(classes.has('boost-quake')).toBe(true)
    vi.advanceTimersByTime(1)
    expect(classes.has('boost-quake')).toBe(false)
  })

  it('o cancelamento para na hora e limpa o timer', () => {
    const stop = startQuake()
    stop()
    expect(classes.has('boost-quake')).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})
```
`lib/boostQuake.ts`:
```ts
/** SSS: a janela treme uma vez no slam (a classe no <body> ativa o keyframe). Devolve o cancelamento. */
export function startQuake(durationMs = 600): () => void {
  document.body.classList.add('boost-quake')
  const timer = setTimeout(() => document.body.classList.remove('boost-quake'), durationMs)
  return () => {
    clearTimeout(timer)
    document.body.classList.remove('boost-quake')
  }
}
```
Rode os dois testes (primeiro veja falhar, depois passar).

- [ ] **Step 5: Hooks**

`hooks/useBoostBanner.ts`:
```ts
import { type ActiveBoostBanner, pickBoostBanner } from '../lib/boost'
import { type BoostCelebration, useBoostStore } from '../store/boostStore'
import { useCallStore } from '../../call/store/callStore'

/**
 * O banner de ativação que vale para mim agora: fora da call do buff, ou
 * mutado/surdo (quem está pausado não ganha o buff), não há banner nem som.
 */
export function useActiveBoostBanner(): ActiveBoostBanner<BoostCelebration> | null {
  const stored = useBoostStore((s) => s.celebration)
  const callId = useCallStore((s) => s.callId)
  const paused = useCallStore((s) => s.muted || s.deafened)
  return pickBoostBanner(stored, paused, callId)
}
```

`hooks/useBoostEffects.ts`:
```ts
import { useEffect } from 'react'
import type { BoostStage } from '../lib/boost'
import { startQuake } from '../lib/boostQuake'
import { playBoostCelebration } from '../lib/boostSounds'

/** SSS: treme a janela enquanto o banner está montado (sai junto com ele). */
export function useBoostQuake(quake: boolean): void {
  useEffect(() => {
    if (!quake) return
    return startQuake()
  }, [quake])
}

/** Toca o stinger do rank quando o banner monta (uma vez por celebração). */
export function useBoostSound(key: number, stage: BoostStage): void {
  useEffect(() => {
    playBoostCelebration(key, stage)
  }, [key, stage])
}
```

- [ ] **Step 6: Componentes (testes primeiro)**

`components/BoostBannerView.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { boostRank } from '../lib/boost'
import BoostBannerView from './BoostBannerView'

const render = (percent: number, eligible = 4): string =>
  renderToStaticMarkup(
    <BoostBannerView celebrationKey={1} eligible={eligible} rank={boostRank(percent)!} />
  )
const count = (html: string, needle: string): number => html.split(needle).length - 1

describe('BoostBannerView', () => {
  it('D: letra, texto, multiplicador e pessoas, sem efeitos', () => {
    const html = render(125, 2)
    expect(html).toContain('aria-label="Buff de XP x1.25: Dope!"')
    expect(html).toContain('Dope!')
    expect(html).toContain('x1.25')
    expect(html).toContain('2 pessoas')
    for (const fx of ['boost-flash', 'boost-edge', 'boost-ring']) expect(html).not.toContain(fx)
    expect(count(html, 'boost-spark')).toBe(0)
  })

  it('sem contagem de pessoas, não escreve "pessoas"', () => {
    expect(render(150, 0)).not.toContain('pessoas')
  })

  it('S pisca as bordas mas não tem anel nem faíscas', () => {
    const html = render(250, 6)
    expect(html).toContain('boost-edge')
    expect(html).not.toContain('boost-ring')
    expect(count(html, 'boost-spark')).toBe(0)
  })

  it('SS tem anel, bordas e 12 faíscas, sem flash de tela', () => {
    const html = render(300, 8)
    expect(html).toContain('boost-ring')
    expect(html).toContain('boost-edge')
    expect(count(html, 'boost-spark')).toBe(12)
    expect(html).not.toContain('boost-flash')
  })

  it('SSS tem tudo: flash de tela, anel, bordas e 22 faíscas', () => {
    const html = render(400, 10)
    expect(html).toContain('boost-flash')
    expect(html).toContain('boost-ring')
    expect(html).toContain('boost-edge')
    expect(count(html, 'boost-spark')).toBe(22)
    expect(html).toContain("Smokin&#x27; Sexy Style!")
  })

  it('o estágio vai para a letra (o CSS escolhe pulso e glitch por ele)', () => {
    expect(render(125)).toContain('data-stage="1"')
    expect(render(400)).toContain('data-stage="7"')
  })
})
```
`components/BoostBanner.test.tsx`:
```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { boostRank } from '../lib/boost'

const active = vi.hoisted(() => ({ value: null as unknown }))
vi.mock('../hooks/useBoostBanner', () => ({ useActiveBoostBanner: () => active.value }))

import BoostBanner from './BoostBanner'

describe('BoostBanner', () => {
  beforeEach(() => {
    active.value = null
  })

  it('sem banner ativo (outra call, mutado ou surdo), não desenha nada', () => {
    expect(renderToStaticMarkup(<BoostBanner />)).toBe('')
  })

  it('com banner ativo, mostra o rank', () => {
    active.value = {
      celebration: { callId: 'c1', percent: 175, eligible: 4, key: 7 },
      rank: boostRank(175)
    }
    const html = renderToStaticMarkup(<BoostBanner />)
    expect(html).toContain('Blast!')
    expect(html).toContain('x1.75')
  })
})
```
Rode ambos → FAIL. Depois implemente:

`components/BoostSparks.tsx`:
```tsx
import type { CSSProperties } from 'react'
import { sparkLayout } from '../lib/boostSparks'
import './boost.css'

/** Faíscas que estouram do banner (SS e SSS). */
function BoostSparks({ count, color }: { count: number; color: string }): React.JSX.Element {
  return (
    <>
      {sparkLayout(count).map((spark, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="boost-motion absolute left-14 top-1/2 rounded-full"
          style={
            {
              '--dx': `${spark.dx}px`,
              '--dy': `${spark.dy}px`,
              width: spark.size,
              height: spark.size,
              background: i % 2 === 0 ? color : '#ffffff',
              boxShadow: `0 0 6px ${color}`,
              animation: `boost-spark 1s ease-out ${spark.delay}ms both`
            } as CSSProperties
          }
        />
      ))}
    </>
  )
}

export default BoostSparks
```

`components/BoostBannerView.tsx` — o JSX que hoje está dentro de `BoostBanner.tsx` (linhas 55–141), sem os hooks e sem o `useMemo`; `celebration.eligible` vira `eligible`, as faíscas viram `<BoostSparks count={rank.sparks} color={rank.color} />` e o import de `./boost.css` vem junto:
```tsx
import type { CSSProperties } from 'react'
import type { BoostRank } from '../lib/boost'
import BoostSparks from './BoostSparks'
import './boost.css'

interface BoostBannerViewProps {
  celebrationKey: number
  eligible: number
  rank: BoostRank
}

/**
 * Desenho do banner de ativação do buff de XP. A festa cresce com o rank
 * (lib/boost.ts): D a A só deslizam a letra; S pisca as bordas; SS solta onda
 * de choque e faíscas; SSS também faz flash dourado de tela cheia e glitch.
 */
function BoostBannerView({ celebrationKey, eligible, rank }: BoostBannerViewProps): React.JSX.Element {
  const vars = {
    '--boost-color': rank.color,
    '--boost-accent': rank.accent
  } as CSSProperties

  return (
    <div
      key={celebrationKey}
      role="status"
      aria-label={`Buff de XP ${rank.label}: ${rank.text}`}
      className="pointer-events-none fixed inset-0 z-50"
      style={vars}
    >
      {rank.screenFlash && (
        <span
          aria-hidden="true"
          className="boost-flash boost-motion absolute inset-0"
          style={{ animation: `boost-flash ${rank.durationMs}ms ease-out both` }}
        />
      )}
      {rank.edgeFlash && (
        <span
          aria-hidden="true"
          className="boost-edge boost-motion absolute inset-0"
          style={{ animation: `boost-edge ${Math.min(1400, rank.durationMs)}ms ease-out both` }}
        />
      )}

      <div
        className="boost-anim absolute left-0 top-[calc(var(--titlebar-height,0px)+5rem)]"
        style={{ animation: `boost-banner ${rank.durationMs}ms ease-in-out both` }}
      >
        <div className="relative flex items-center gap-4 py-2 pl-6 pr-12">
          {/* Fundo recortado numa camada própria: o clip-path cortaria o anel e as faíscas. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ filter: `drop-shadow(0 0 15px ${rank.color}88)` }}
          >
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(90deg, ${rank.accent}f2, #0b0b10f2 70%)`,
                borderBottom: `3px solid ${rank.color}`,
                clipPath: 'polygon(0 0, 100% 0, calc(100% - 22px) 100%, 0 100%)'
              }}
            />
          </div>

          <span className="relative flex items-center justify-center">
            {rank.ring && (
              <span
                aria-hidden="true"
                className="boost-ring boost-motion absolute left-1/2 top-1/2 h-16 w-16"
                style={{ animation: 'boost-ring 0.9s ease-out 0.25s both' }}
              />
            )}
            <span className="boost-letter text-6xl" data-stage={rank.stage}>
              {rank.letter}
            </span>
          </span>

          <div className="relative leading-tight">
            <p className="boost-text text-lg">{rank.text}</p>
            <p className="text-xs font-bold text-gray-200">
              XP {rank.label}
              {eligible > 0 && ` · ${eligible} pessoas`}
            </p>
          </div>

          <BoostSparks count={rank.sparks} color={rank.color} />
        </div>
      </div>
    </div>
  )
}

export default BoostBannerView
```

`components/BoostBannerEffects.tsx`:
```tsx
import type { BoostRank } from '../lib/boost'
import { useBoostQuake, useBoostSound } from '../hooks/useBoostEffects'

/**
 * Efeitos do banner que não são desenho: o som do rank e a tremida do SSS.
 * Monta junto com o banner e desmonta quando ele acaba (a tremida para junto).
 */
function BoostBannerEffects({
  celebrationKey,
  rank
}: {
  celebrationKey: number
  rank: BoostRank
}): null {
  useBoostQuake(rank.quake)
  useBoostSound(celebrationKey, rank.stage)
  return null
}

export default BoostBannerEffects
```

`components/BoostBanner.tsx` (substitui o arquivo inteiro; sai o `import './boost.css'` da Task 1, que agora mora no `BoostBannerView`):
```tsx
import { useActiveBoostBanner } from '../hooks/useBoostBanner'
import BoostBannerEffects from './BoostBannerEffects'
import BoostBannerView from './BoostBannerView'

/**
 * Banner de ativação do buff de XP (quando a call ganha buff ou sobe de rank),
 * com o som do rank. Só existe para quem está na call do buff e não está
 * mutado/surdo (ver `pickBoostBanner`).
 */
function BoostBanner(): React.JSX.Element | null {
  const active = useActiveBoostBanner()
  if (!active) return null

  const { celebration, rank } = active
  return (
    <>
      <BoostBannerEffects key={celebration.key} celebrationKey={celebration.key} rank={rank} />
      <BoostBannerView
        key={celebration.key}
        celebrationKey={celebration.key}
        eligible={celebration.eligible}
        rank={rank}
      />
    </>
  )
}

export default BoostBanner
```

- [ ] **Step 7: Rodar tudo da feature, typecheck e CRAP**

```bash
cd /c/Users/Admin/orca/workspaces/concord/xp/frontend
npx vitest run src/renderer/src/features/levels src/renderer/src/features/call/lib/sounds.test.ts 2>&1 | tail -15
npx --yes yarn@1.22.22 typecheck 2>&1 | tail -10
cd .. && node scripts/crap.mjs --files frontend/src/renderer/src/features/levels/components/BoostBanner.tsx frontend/src/renderer/src/features/levels/components/BoostBannerView.tsx frontend/src/renderer/src/features/levels/components/BoostBannerEffects.tsx frontend/src/renderer/src/features/levels/components/BoostSparks.tsx frontend/src/renderer/src/features/levels/hooks/useBoostBanner.ts frontend/src/renderer/src/features/levels/hooks/useBoostEffects.ts frontend/src/renderer/src/features/levels/lib/boostSounds.ts frontend/src/renderer/src/features/levels/lib/boostSparks.ts frontend/src/renderer/src/features/levels/lib/boostQuake.ts frontend/src/renderer/src/features/levels/lib/boost.ts frontend/src/renderer/src/features/call/lib/sounds.ts 2>&1 | tail -30
```
Expected: verde; CRAP ≤ 15 em tudo (o `BoostBanner` sai de 132). Os efeitos (`useEffect`) não rodam em `renderToStaticMarkup`; a lógica deles está coberta pelas funções puras (`startQuake`, `playBoostCelebration`, `pickBoostBanner`). Se alguma função ficar acima de 15, quebre mais antes de seguir.

- [ ] **Step 8: Commit**

```bash
cd /c/Users/Admin/orca/workspaces/concord/xp
git add frontend/src/renderer/src/features/call/lib/sounds.ts frontend/src/renderer/src/features/levels/lib/boostSounds.ts frontend/src/renderer/src/features/levels/lib/boostSounds.test.ts frontend/src/renderer/src/features/levels/lib/boostSparks.ts frontend/src/renderer/src/features/levels/lib/boostSparks.test.ts frontend/src/renderer/src/features/levels/lib/boostQuake.ts frontend/src/renderer/src/features/levels/lib/boostQuake.test.ts frontend/src/renderer/src/features/levels/hooks/useBoostBanner.ts frontend/src/renderer/src/features/levels/hooks/useBoostEffects.ts frontend/src/renderer/src/features/levels/components/BoostBanner.tsx frontend/src/renderer/src/features/levels/components/BoostBanner.test.tsx frontend/src/renderer/src/features/levels/components/BoostBannerView.tsx frontend/src/renderer/src/features/levels/components/BoostBannerView.test.tsx frontend/src/renderer/src/features/levels/components/BoostBannerEffects.tsx frontend/src/renderer/src/features/levels/components/BoostSparks.tsx
git commit -m "feat(levels): som sintetizado em cada rank do buff e banner em peças menores"
```

---

### Task 6: Comentário do dev, nota de changelog e documentação

**Files:**
- Modify: `frontend/src/renderer/src/main.tsx:59`
- Create: `changelog/pending/2026-10-31-ranks-buff-voz.md`

- [ ] **Step 1:** Em `main.tsx`, troque (Edit de uma linha) `// \`__salinhaBoost(175)\` liga um buff de XP falso (125/150/175/200) na sua call.` por `// \`__salinhaBoost(175)\` liga um buff de XP falso (125/150/175/200/250/300/400) na sua call.` Não toque na linha 58 (tem caracteres já corrompidos que não são desta mudança).

- [ ] **Step 2:** Criar `changelog/pending/2026-10-31-ranks-buff-voz.md`:
```md
## Novidades

- Voz: o bônus de XP agora começa já com 2 pessoas na call e sobe pelos ranks D, C, B, A, S, SS e SSS, chegando a x4 de XP com 10 pessoas ou mais.
- Voz: cada rank toca um som próprio quando o bônus de XP é ativado ou sobe.
```
Validar: `node scripts/publish-changelog.mjs --check changelog/pending` → sem erro.

- [ ] **Step 3:** Commit
```bash
cd /c/Users/Admin/orca/workspaces/concord/xp
git add frontend/src/renderer/src/main.tsx changelog/pending/2026-10-31-ranks-buff-voz.md
git commit -m "docs(levels): changelog dos ranks do buff de voz"
```

---

### Task 7: Verificação de ponta a ponta

- [ ] **Step 1: CRAP depois** (compare com `scratchpad/crap-before.txt`):
```bash
cd /c/Users/Admin/orca/workspaces/concord/xp
export GO="/c/Users/Admin/AppData/Local/Temp/claude/C--Users-Admin-orca-concord/0b965887-2e45-4c09-9a2e-e149f80567e6/scratchpad/go/bin/go.exe"
node scripts/crap.mjs 2>&1 | tee C:/Users/Admin/AppData/Local/Temp/claude/C--Users-Admin-orca-workspaces-concord-xp/9bd85cb6-6d70-4491-be7d-dbf4adb35cb5/scratchpad/crap-after.txt | tail -25
```
Expected: nenhuma função tocada acima de 15.

- [ ] **Step 2: Pipeline do PR**
```bash
export GO="..."   # igual ao anterior
node scripts/affected-tests.mjs pr 2>&1 | tail -40
```
Expected: verde. Falhas só por ambiente (Windows, ver memória `concord-dev-env`: `apply-caddyfile.test.mjs`, `deploy-vps.test.mjs`) devem ser reportadas como tal, com a causa, e não escondidas. `check-structure` tem de passar (o `main.css` saiu menor).

- [ ] **Step 3: Conferir o visual a 360, 768 e 1280 px** com uma harness temporária (`frontend/.harness`, ver memória `concord-dev-env`; apague ao terminar e **não** commite): renderizar `BoostBannerView` para os 7 percentuais (125…400) e `VoiceXPBar` com e sem pausa; Playwright com `channel: 'chrome'`. Conferir: letra e texto cabem a 360 px, o cinza de pausa, o brilho de D a SSS e as brasas só em SS/SSS. Confirmar também no app (`yarn dev:web`) com `window.__salinhaBoost(125)` … `(400)`: banner e som de cada rank, corte do som ao subir D→C→B, e nada ao mutar.

- [ ] **Step 4: Rodar a skill `web-design-guidelines`** nos arquivos de UI alterados (`BoostBannerView.tsx`, `XpProgressBar.tsx`, `BoostShine.tsx`, `BoostEmbers.tsx`) e `node scripts/check-design.mjs`.

- [ ] **Step 5:** `superpowers:verification-before-completion`, depois `superpowers:requesting-code-review` (subagente, contra a spec e este plano) e `superpowers:finishing-a-development-branch`. **Confirmar com o usuário antes de push e PR** (branch `feat/ranks-buff-voz` → fork `caiolucio360/concord` → PR na base `develop` de `hugoemannuel/concord`, sem atribuição de IA). No corpo do PR: CRAP antes/depois (`crap-before.txt`/`crap-after.txt`), screenshots 360/768/1280, nota de compatibilidade (app antigo mostra o rank pelo percentual antigo até atualizar).

---

## Self-review

- **Cobertura da spec:** faixas e percentuais (Task 2 e 3); textos D/C/B (Task 3); cores e durações (Task 3); `data-stage` renumerado e CSS fora do `main.css` (Tasks 1 e 3); `StyleRank`/`VoiceXPBar` (Task 4: `StyleRank` só consome `rank.stage`, que continua válido, e é exercitado pelos testes do `VoiceXPBar`); som sintetizado fora do `SOUNDS`, `level: true`, teto de volume, cabe no banner, uma vez por `key`, não toca pausado (Task 5: `pickBoostBanner` + `playBoostCelebration`); `boostStore` sem mudança de lógica, só testes (Task 3); testes Go da tabela, `accrue` e eventos (Task 2); CRAP (Tasks 4, 5, 7); responsivo e e2e (Task 7); changelog (Task 6).
- **Placeholders:** nenhum "TBD". Os trechos "se não compilar de primeira, use a forma B" (Task 5, Step 5) e "baixe os `share`" (Step 3) são alternativas concretas com a ação definida, não lacunas.
- **Consistência de tipos:** `BoostStage` 1–7, `BoostRank.shineMs/embers`, `pickBoostBanner`, `BOOST_SOUNDS`, `playBoostCelebration(key, stage)`, `useBoostSound(key, stage)`, `useBoostQuake(quake)`, `sparkLayout`, `emberLayout`, `xpFillStyle`, `BoostBannerView({celebrationKey, eligible, rank})` usados com os mesmos nomes em todas as tasks.
- **Desvio da spec:** o `boostRank` troca ternários por tabela (como a spec pede) e `boostPercent` mantém o `switch` de 7 casos (complexidade 8).
