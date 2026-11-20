# Plano: menção de cargos e `@everyone`

Spec: [2026-11-20-mencao-de-cargos-design.md](../specs/2026-11-20-mencao-de-cargos-design.md).
ADR: [0065](../../adr/0065-mencao-de-cargo-pelo-nome.md).

Branch `feat/mencao-de-cargos`, empilhada em `feat/navegacao-teclado-sugestoes` (PR #613) enquanto
ele não entra na `develop`; rebase em `origin/develop` antes do push.

Cada tarefa: teste primeiro (falhando pelo motivo certo), código mínimo, `affected-tests loop`.
Commits estruturais separados dos de comportamento.

## Backend

1. **Migration `000208_role_mentions`** (up/down): `roles.mentionable`, `messages.mention_roles`,
   `server_notification_settings.suppress_roles`.
2. **Cargo mencionável** (`permission`, `role`): `Role.Mentionable`, colunas, `Input.Mentionable`,
   recusa nos cargos fixos.
3. **Meus cargos por servidor** (`role`): consulta e `GET /users/me/server-roles`.
4. **`@everyone` = `@all`** (`message/mention.go`).
5. **Handle e validação** (`message/mention_role.go`): `RoleHandle`, casos em
   `testdata/role_handles.json`, validação dos ids, anti-spam único com `@all`/`@here`.
6. **Gravar e ler `mention_roles`** (`model`, `insert`, `repository`, `message_scan`,
   `create_handler`, `create`), porta `RoleSource` e ligação em `wire_chat.go`.
7. **Edição só tira** (`edit.go`).
8. **Push**: commit estrutural (`mention_targets.go` sai do `notifier.go`), depois alvos por cargo,
   `suppress_roles` e nick igual ao handle (D8).
9. **`suppress_roles`** (`notifysettings`).

## Desktop e web

10. **Handle e casos compartilhados** (`chat/lib/roleMentions.ts`).
11. **`@everyone`**, `mentionQuery` com acento e `-`, `mention_roles` em `messageMentionsMe`.
12. **Meus cargos** (`servers/store/myRolesStore.ts`, API e eventos).
13. **Sugestões de cargo** (lib, `useMentionMenu` com as escolhas, linha na lista).
14. **Envio** de `mention_role_ids` (`useComposerSend`, `api/messages.ts`).
15. **Chip do cargo** e quebra do texto.
16. **Notificações**: `MentionKind.role`, `suppressRoles`, título do aviso, chave no modal, resumo.
17. **Editor de cargo** (chave) e catálogo de permissões (texto).

## Android

18. `myRolesStore` e `inAppNotification` com `mention_everyone` e `mention_roles`.

## Fechamento

19. Docs: `CARGOS.md`, `PUSH.md`, índice de ADRs, changelog pendente.
20. CRAP ≤ 15 nas funções tocadas, god files menores, responsivo em 360/768/1280,
    `node scripts/affected-tests.mjs pr` verde.
