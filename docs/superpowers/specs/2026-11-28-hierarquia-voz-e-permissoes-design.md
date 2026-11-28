# Spec: Hierarquia de Cargos, Moderação de Voz e Votação de Castigo

> Data: 2026-11-28  
> Status: Aprovada (após sessão de grill e ajustes finais)  
> Branch: `feat/hierarquia-voz-e-permissoes` (base `upstream/develop`)

## 1. Objetivo

Padronizar a comparação de hierarquia de cargos (sempre considerando o **cargo mais alto** de cada membro, `HighestPosition`):

- **Moderação de voz** (*Silenciar no servidor*, *Ensurdecer no servidor*, *Desconectar da chamada* e *Mover entre canais de voz*, tanto no menu quanto no arrastar-e-soltar): exige a permissão no canal de voz **e** que o cargo mais alto do ator seja **igual ou maior** que o do alvo (`CanModerateVoice`: `actorHighest >= targetHighest`, sem imunidade especial do dono como alvo — se o dono não tiver cargo acima do ator, pode sofrer ações de voz; se tiver cargo acima, fica protegido; o dono como ator sempre pode).
- **Auto-moderação de voz** (`actor == target`): quem tem `MUTE_MEMBERS` ou `DEAFEN_MEMBERS` no canal satisfaz `>=` (e o dono sempre pode) para alternar/liberar *Silenciar no servidor* e *Ensurdecer no servidor* em si mesmo (no backend e no `SelfUserMenu`).
- **Alterar apelido de terceiros** (`MANAGE_NICKNAMES`): mantém hierarquia `>=` (`CanManageNicknameOf`, sempre pelo cargo mais alto), com o dono protegido (só o próprio dono altera o seu apelido).
- **Ações permanentes/estruturais, Castigo direto e Votação de castigo** (*Expulsar*, *Banir*, *Castigo direto*, **abrir votação de castigo** e *Gerenciar cargos*): mantêm hierarquia estrita (`>`, `CanActOn`), sempre pelo cargo mais alto, com o dono imune.

## 2. Decisões e Matriz de Regras

Todas as comparações de posição usam o **cargo mais alto** de cada membro (`0` = apenas `@everyone`).

| Ação | Permissão exigida | Cargo menor (`>`) | Mesmo cargo (`==`) | Cargo acima (`<`) | Dono como alvo | Si mesmo |
|---|---|---|---|---|---|---|
| **Silenciar no servidor** | `MUTE_MEMBERS` (no canal) | Sim | Sim | Não | Depende do cargo mais alto do dono (`>=`) | Sim (alternar/liberar) |
| **Ensurdecer no servidor** | `DEAFEN_MEMBERS` (no canal) | Sim | Sim | Não | Depende do cargo mais alto do dono (`>=`) | Sim (alternar/liberar) |
| **Desconectar da chamada** | `DISCONNECT_MEMBERS` (no canal) | Sim | Sim | Não | Depende do cargo mais alto do dono (`>=`) | Não aparece no menu próprio |
| **Mover entre canais de voz** (menu e drag-and-drop) | `MOVE_MEMBERS` (origem) + `VIEW_CHANNEL` (destino) + alvo com `VIEW_CHANNEL \| CONNECT` (destino) | Sim | Sim | Não | Depende do cargo mais alto do dono (`>=`) | Sim |
| **Alterar apelido de terceiros** | `MANAGE_NICKNAMES` (servidor) | Sim | Sim | Não | Não (só o dono) | Usa `CHANGE_NICKNAME` |
| **Expulsar do servidor** | `KICK_MEMBERS` (servidor) | Sim | Não | Não | Não | Não |
| **Banir do servidor** | `BAN_MEMBERS` (servidor) | Sim | Não | Não | Não | Não |
| **Castigo direto** (aplicar/tirar) | `MUTE` / `DEAFEN` / `DISCONNECT` (servidor) | Sim | Não | Não | Não | Não |
| **Votação de castigo** (abrir votação) | Estar na call (membro) + `CanActOn` | Sim | Não | Não | Não | Não |
| **Gerenciar cargos** | `MANAGE_ROLES` (servidor) | Só cargos abaixo | Não | Não | Só o próprio dono | Só cargos abaixo (dono: qualquer um) |

Observações preservadas:
- Em votação de castigo, quem abre precisa ter cargo mais alto estritamente maior que o alvo (`CanActOn`); depois de aberta, os demais membros da call (menos o alvo) votam normalmente. Se durante a votação o alvo subir para cargo `>=` ao de quem abriu, a aplicação da votação falha e não pune.
- Em canais de voz, sem `CONNECT` as permissões implícitas de moderação de voz (`MUTE_MEMBERS`, `DEAFEN_MEMBERS`, `MOVE_MEMBERS`, `DISCONNECT_MEMBERS`) continuam caindo.
- Visitantes em chamada (posição 0, não membros) continuam moderáveis normalmente por quem tem a permissão no canal.
- Na UI, sem permissão/hierarquia suficiente, a opção nem aparece.

## 3. Textos Aprovados (UI)

- Descrição de `MANAGE_NICKNAMES` em `frontend/src/renderer/src/features/servers/lib/permissionCatalog.ts`:
  `"Mudar o apelido de quem tem cargo igual ou abaixo do seu."`

## 4. Arquitetura e Arquivos Afetados

- **Backend Go**
  - `backend/internal/permission/`: adicionar `CanModerateVoice` (em `compute.go` e `snapshot.go`) usando `HighestPosition` (`>=`, dono como ator sempre pode, sem imunidade especial do dono como alvo), remover `CanDisconnectMember`/`CanMoveMember`, adicionar `can_manage_nickname_of` e `can_moderate_voice` em `testdata/vectors.json` e `vectors_test.go`.
  - `backend/internal/call/`: usar `snap.CanModerateVoice(actorID, targetID)` em `authorizeAction` (`permissions.go`) e `authorizeMove` (`move.go`); reutilizar `authorizeAction` em `DisconnectParticipant`; remover `ErrCannotMoveOwner` de `move.go` e `moderation_handler.go`.
  - `backend/internal/castigo/`: exigir `snap.CanActOn(initiatorID, req.UserID)` em `StartVote` e validar novamente em `applyVote` (`votes.go`).
  - `backend/internal/server/nickname.go`: atualizar comentário do struct `Nicknames`.
- **Frontend Electron/Web**
  - `frontend/src/renderer/src/features/servers/lib/`: adicionar `canModerateVoice` em `permissions.ts` e `canModerateVoiceMember` em `serverAccess.ts`, remover `canDisconnectMember`/`canMoveMember`, atualizar `permissionCatalog.ts`.
  - `frontend/src/renderer/src/features/call/lib/voiceMove.ts` + `VoiceChannelMembers.tsx`: exigir `canModerateTarget` (`access.canModerateVoiceMember(...)`) além de `MOVE_MEMBERS`.
  - `frontend/src/renderer/src/features/profile/`: passar `canModerateVoice` para `computeServerModerationPerms` em `userMenuActions.ts` e `useStandardUserMenuModel.ts`; manter `SelfVoiceModeration.tsx` conectado ao `SelfUserMenu`.
  - `frontend/src/renderer/src/features/castigo/hooks/useCastigoMenu.ts`: exigir `canAct` (`access.canActOnMember(target.userId)`) em `eligible` para que "Castigo..." (inclusive votação) só apareça para cargos estritamente menores.
- **Documentação**
  - `docs/CARGOS.md`: atualizar seções *O dono*, *Permissões*, *Hierarquia*, *Voz* e *Castigo*.

## 5. Fora de Escopo

- Nova ação de bloquear câmera ou transmissão por moderação de servidor.
- Alterações em `mobile/` (sem menus de moderação de servidor/voz).
- Alterações na mensagem de erro `role_hierarchy`.

## 6. Verificação de Ponta a Ponta

1. TDD em Go (`permission`, `call`, `castigo`, `server`, `role`) e Vitest (`permissions`, `serverAccess`, `voiceMove`, `userMenuActions`, `UserContextMenu`, `VoiceChannelRow`, `castigoMenu`).
2. `go vet ./...`, `npm run typecheck`, `check-structure.mjs`, `check-design.mjs`, `crap.mjs` (CRAP ≤ 15 em todas as funções tocadas).
3. Code review independente em subagente limpo contra esta spec e o `AGENTS.md`.
