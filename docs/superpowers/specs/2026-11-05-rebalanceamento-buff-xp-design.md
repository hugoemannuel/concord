# Rebalanceamento do buff de XP de voz

## Por quê

O buff de XP por tamanho de call está fácil demais: 2 pessoas já dão 1,25x e 5
pessoas já dão 2x. Uma call de 2 pessoas é a call normal, não merece bônus, e os
ranks altos chegam rápido demais. Cada rank precisa de mais gente em call.

## Objetivo

Manter os 7 ranks (D, C, B, A, S, SS, SSS) e os mesmos multiplicadores, exigindo
mais pessoas elegíveis para cada um.

| Rank | Multiplicador | Antes | Agora |
|---|---|---|---|
| — | 1x | 1 | 1–2 |
| D | 1,25x | 2 | 3–4 |
| C | 1,5x | 3 | 5–6 |
| B | 1,75x | 4 | 7–9 |
| A | 2x | 5 | 10–12 |
| S | 2,5x | 6–7 | 13–15 |
| SS | 3x | 8–9 | 16–19 |
| SSS | 4x | 10+ | 20+ |

"Elegível" não muda: sem mute, sem surdo, sem AFK, com mais alguém ouvindo.

## Fora do escopo

- Curva de níveis (`level/curve.go`), XP base (10/min), teto diário, nível do
  servidor.
- Mudar quem conta como elegível.
- XP já ganho: nada é recalculado.

## Abordagens

1. **Trocar os degraus na tabela do servidor** (escolhida): uma função
   (`boostPercent` em `backend/internal/level/boost.go`) e o teste dela.
2. Tabela configurável (por servidor ou env): mais trabalho, ninguém pediu.
3. Fórmula contínua: não bate com ranks fixos.

## Impacto

- Backend: `boost.go` (degraus e comentário) e `boost_test.go`.
- Cliente: nada. O rank, banner, sons e efeitos são derivados do percentual
  (`features/levels/lib/boost.ts`), que continua o mesmo; o banner já mostra o
  número de pessoas vindo do evento. O mobile não usa o buff.
- Efeito: numa call de 5 pessoas, o nível 10 sai em ~5 h (1,5x) em vez de ~3,8 h
  (2x); uma dupla vai de ~6 h (1,25x) para ~7,6 h (1x).

## Para quem implementa

- Atualizar o comentário de `boostPercent` com os novos degraus.
- Teste de tabela cobrindo as bordas de cada degrau (2, 3, 4, 5, 6, 7, 9, 10,
  12, 13, 15, 16, 19, 20).
