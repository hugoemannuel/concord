# Plano de Implementação: Hierarquia de Cargos, Moderação de Voz e Votação de Castigo

> Data: 2026-11-28  
> Branch: `feat/hierarquia-voz-e-permissoes`  
> Base: `upstream/develop`  
> Spec: [2026-11-28-hierarquia-voz-e-permissoes-design.md](../specs/2026-11-28-hierarquia-voz-e-permissoes-design.md)

## 1. Resumo das Tarefas (TDD)

1. **Pacote `permission` (Go)**:
   - Adicionar `can_moderate_voice` (além de `can_manage_nickname_of`) em `testdata/vectors.json` e `vectors_test.go`.
   - Implementar `CanModerateVoice` em `compute.go` e `Snapshot.CanModerateVoice` em `snapshot.go` (cargo mais alto `>=`, dono como ator sempre pode, sem imunidade especial do dono como alvo).
   - Testar múltiplos cargos, dono sem cargo e dono com cargo acima em `snapshot_test.go`.
2. **Pacote `call` (Go)**:
   - Testes em `permissions_test.go`: moderação de voz (mute, deafen, disconnect, move) permitida para menor/mesmo cargo/dono sem cargo acima/auto-liberação, e **negada** (`ErrCannotActOnMember`) contra cargo acima (membro ou dono com cargo acima), usando sempre o cargo mais alto.
   - Aplicar `snap.CanModerateVoice(actorID, targetID)` em `authorizeAction` (`permissions.go`) e `authorizeMove` (`move.go`).
3. **Pacote `castigo` (Go)**:
   - Testes em `vote_test.go` e `handler_test.go`: `StartVote` e `applyVote` exigem `CanActOn` (`>` estrito pelo cargo mais alto).
   - Aplicar `snap.CanActOn` em `StartVote` e `applyVote` (`votes.go`).
4. **Frontend TS/React**:
   - `permissions.ts` / `serverAccess.ts`: adicionar `canModerateVoice` / `canModerateVoiceMember`.
   - `voiceMove.ts` / `VoiceChannelMembers.tsx` / `userMenuActions.ts` / `useStandardUserMenuModel.ts`: usar `canModerateVoiceMember` nas 4 ações de voz (menu + drag-and-drop), mantendo `canActOnMember` em `kick`/`ban`.
   - `useCastigoMenu.ts` / `castigoMenu.ts`: exigir `canAct` em `eligible`.
   - Atualizar todos os testes Vitest correspondentes.
5. **Documentação & Verificação Final**:
   - Atualizar `docs/CARGOS.md`.
   - `gofmt -w` nos `.go` alterados, `go vet ./...`, testes Go, `npm run typecheck`, Vitest, `check-structure.mjs`, `check-design.mjs`, `crap.mjs` (CRAP ≤ 15).
   - Code review independente em subagente e commits locais.
