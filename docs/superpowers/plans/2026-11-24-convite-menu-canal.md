# Plano: convite pelo menu do botão direito do canal (#616)

**Objetivo:** "Convidar pessoas" no menu do canal (botão direito e "•••"), em canais de
texto e de voz, abrindo o mesmo modal de convite do servidor.

**Arquitetura:** sem padrão novo. O menu da área vazia da lista já tem "Convidar pessoas"
(`SidebarAreaMenu` → `uiStore.openServerInviteModal`); o menu do canal ganha o mesmo item
pela tabela de regras de `lib/sidebarMenus.ts`. O convite do servidor é um código único
(sem convite por canal no backend), então o link é o mesmo do modal. Sem ADR.

## Tarefas (TDD)

1. `lib/sidebarMenus.ts`: item `invite` no topo, regra `hasServer && canInvite`
   (permissão `CREATE_INVITE`), em texto e voz, inclusive canais de sistema e de evento.
2. `lib/channelSidebar.ts`: `canOpenChannelMenu` abre o menu do canal de voz também para
   quem pode convidar (antes só para quem gerencia canais/permissões).
3. `components/ChannelMenu.tsx`: rótulo "Convidar pessoas" (texto já aprovado no menu da
   área), ícone `UserPlusIcon`, ação abre o modal de convite do servidor.
4. `components/ServerSidebar.tsx`: passa `CREATE_INVITE` para `canOpenChannelMenu`.

## Fora do escopo

- App Android (`mobile/`): sem botão direito; fica para outra issue se pedirem.
