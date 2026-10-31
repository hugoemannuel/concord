# Ranks D–SSS, sons e teto de x4 no buff de XP de voz

Evolui o [buff de XP por pessoas na call](2026-10-25-voice-xp-boost-design.md).

## Objetivo

1. O buff começa do início, como o ranking de estilo do jogo: **D, C, B, A, S, SS,
   SSS** (hoje só existem A, S, SS e SSS, e o A já começa com 4 pessoas).
2. Cada rank toca um som ao ser ativado ou ao subir.
3. O multiplicador passa de x2,0: o teto sobe para **x4,0**.

## Decisões

- **Som sintetizado, sem voz.** O áudio das falas do jogo é da Capcom e não entra
  no repo (a spec anterior já excluía fonte, logo e arte). Os sons são stingers
  originais em WebAudio, como os jingles de nível: nenhum arquivo de áudio, nenhum
  risco de direitos, funciona offline.
- **O buff começa com 2 pessoas elegíveis** (`call.eligibleVoiceUsers` já exige
  alguém ouvindo, então 2 é o mínimo possível). Um rank por pessoa de 2 a 5; S, SS
  e SSS ficam nas mesmas faixas de gente de hoje (6–7, 8–9, 10+).
- **Teto x4,0** (escolhido entre x4 e x5): o A já paga x2 e o SSS quadruplica.
- **Som fora do registro `SOUNDS`.** `call/lib/sounds.ts` tem 388 linhas (passaria
  de 400) e cada pack de `appsounds` teria de cobrir 7 sons novos. Quem quiser
  trocar ou desligar o som do buff em Configurações → Notificações faz isso em outra
  spec.
- **Sem ADR:** a feature segue o padrão existente (notas sintetizadas tocadas por
  `playNotes`; banner e store em `features/levels`).

## Regra

| Elegíveis | Rank | Texto | Multiplicador | `percent` |
|-----------|------|-------|---------------|-----------|
| 0–1       | —    | —     | x1,0 (sem buff) | 100 |
| 2         | D    | Dope!     | x1,25 | 125 |
| 3         | C    | Crazy!    | x1,50 | 150 |
| 4         | B    | Blast!    | x1,75 | 175 |
| 5         | A    | Alright!  | x2,00 | 200 |
| 6–7       | S    | Sweet!    | x2,50 | 250 |
| 8–9       | SS   | Showtime! | x3,00 | 300 |
| 10+       | SSS  | Smokin' Sexy Style! | x4,00 | 400 |

Cálculo, resto fracionário, heartbeat do `voice:boost` e descarte do buff sem
heartbeat (25 s) não mudam: os percentuais novos (125…400) cabem nos inteiros que
o código já usa.

## Textos aprovados

Aprovados pelo usuário para os ranks novos: **D "Dope!"**, **C "Crazy!"**,
**B "Blast!"**. Os de A, S, SS e SSS ficam como estão ("Alright!", "Sweet!",
"Showtime!", "Smokin' Sexy Style!"). O banner segue o formato atual, por exemplo
"D — Dope! · XP x1.25 · 2 pessoas".

## Arquitetura

### Backend

- `backend/internal/level/boost.go`: `boostPercent` ganha as faixas da tabela
  (switch de 7 casos, complexidade 8). Comentário atualizado com os ranks.
- `boost_test.go` e `service_test.go`: hoje esperam "4 pessoas = x1,25"; passam a
  seguir a tabela nova.
- Sem migration, sem dependência nova, sem mudança em `service.go`.
- O app mobile não trata `voice:boost`: não é afetado.
- Compatibilidade: um app desktop antigo mostra o rank pelo percentual antigo (125
  viraria "A") até se atualizar, o que acontece sozinho a cada merge na `main`.

### Frontend (`frontend/src/renderer/src`)

- `features/levels/lib/boost.ts`:
  - `BoostStage` passa de `1|2|3|4` para `1…7`; `letter` ganha `'D' | 'C' | 'B'`.
  - `boostRank` troca os ternários aninhados por uma tabela de limiares
    (400, 300, 250, 200, 175, 150, 125), mantendo CRAP baixo.
  - Estágios novos, só com o "slam" da letra (sem faíscas, anel nem flashes):

    | Estágio | Rank | Cor | Contorno | Banner |
    |---------|------|-----|----------|--------|
    | 1 | D | `#94a3b8` (cinza-azulado) | `#334155` | 0,9 s |
    | 2 | C | `#60a5fa` (azul) | `#1e3a8a` | 1,0 s |
    | 3 | B | `#2dd4bf` (verde-água) | `#115e59` | 1,1 s |

  - A, S, SS e SSS mantêm cores, efeitos e durações de hoje (1,2 / 1,6 / 2,0 /
    2,5 s) e viram os estágios 4 a 7.
- `assets/main.css`: os seletores `.boost-letter[data-stage='2'|'3'|'4']`
  (pulso e glitch) são renumerados para `5|6|7`; os estágios 1 a 4 ficam só com o
  slam. Conferir também os usos de `stage` em `StyleRank.tsx` e `VoiceXPBar.tsx`.
- `features/levels/lib/boostSounds.ts` (novo): as notas dos 7 ranks e
  `playBoostSound(stage)`, que chama `playNotes(..., { level: true })` de
  `call/lib/sounds.ts` (mesmo contexto e mesma saída escolhida). Estilo de cada um:

  | Rank | Som | Duração |
  |------|-----|---------|
  | D  | dois "tics" subindo | ~0,25 s |
  | C  | três notas subindo | ~0,4 s |
  | B  | arpejo de 4 notas e acorde curto | ~0,6 s |
  | A  | impacto grave e power chord | ~0,8 s |
  | S  | impacto mais forte, power chord e subida rápida | ~1,1 s |
  | SS | riff, acorde aberto longo e brilho agudo | ~1,5 s |
  | SSS | impacto duplo, riff cheio, acorde grande e cintilar final | ~2,2 s |

  Volume abaixo das vozes: pico ≤ 0,8 × `BASE_VOLUME`, o mesmo teto dos jingles
  de nível. `level: true` faz o rank novo cortar o anterior (D→C→B em sequência
  não se sobrepõe); o som de nível também corta o do buff.
- `features/levels/components/BoostBanner.tsx`: toca `playBoostSound(rank.stage)`
  uma vez por `celebration.key` (mesma proteção `oncePerKey` do StrictMode). O som
  herda as regras do banner: só na subida de rank, só para quem está na call do
  buff, nunca mutado ou surdo (quem está pausado não ganha o buff).
- `boostStore.ts` não muda de lógica (já compara estágios; com 7 estágios o banner
  dispara em D→C→B→A, cada subida, e nunca ao descer ou no heartbeat).
- `prefers-reduced-motion` desliga só as animações, como hoje; o som segue a regra
  do banner.

### Responsivo

Sem tela nova. Banner e letra são os mesmos, e os textos novos (Dope!, Crazy!,
Blast!) são mais curtos que o maior de hoje, então cabem em 360 px. Conferir a
360, 768 e 1280 px no preview.

## Testes (TDD, só o afetado)

- **Go** (`boost_test.go`, `service_test.go`): tabela do `boostPercent` com os
  limites 0→100, 1→100, 2→125, 3→150, 4→175, 5→200, 6→250, 7→250, 8→300, 9→300,
  10→400; `accrue` credita o XP multiplicado pelo percentual novo.
- **`boost.test.ts`**: limiares dos 7 ranks e `null` abaixo de 125; rótulos de
  `x1.25` a `x4.0`; estágios, letras, cores e textos únicos.
- **`boostStore.test.ts`**: subir D→C→B→A dispara o banner a cada subida; descer ou
  repetir o heartbeat não dispara; percent 100 limpa.
- **`boostSounds.test.ts`**: 7 sons, duração crescente por rank, pico dentro do
  teto, cada som cabe na duração do banner do rank.
- **`BoostBanner`**: toca o som uma vez por `key` e não toca quando está mutado ou
  surdo.
- **CRAP ≤ 15** em tudo que for tocado (`node scripts/crap.mjs --files ...`).

## Fora de escopo

Voz ou áudio do jogo; sons personalizáveis em Configurações; buff por servidor ou
cargo; texto de buff em perfil ou ranking; mudança no cálculo de resto do XP;
mudanças no mobile.

## Verificação de ponta a ponta

1. `cd backend && go test ./internal/level`.
2. No front, `npx vitest run` dos arquivos de `features/levels` e
   `call/lib/sounds.test.ts`; `yarn typecheck`.
3. Com o app em dev (`yarn dev:web`), `window.__salinhaBoost` (que chama
   `previewBoost`) simula 125, 150, 175, 200, 250, 300 e 400: conferir banner e
   som de cada rank, o cinza de "XP pausado" ao mutar (sem banner e sem som) e
   o corte entre sons ao subir D→C→B.
4. Conferir o layout a 360, 768 e 1280 px.
5. Chamada real com 2 pessoas: o XP deve vir x1,25 (D) e subir ao entrar mais gente.
6. `node scripts/affected-tests.mjs pr` verde antes de dar por pronto.
