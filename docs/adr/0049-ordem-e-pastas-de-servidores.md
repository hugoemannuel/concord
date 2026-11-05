# 0049. Guardar a ordem e as pastas de servidores por usuário como layout reconciliado em `internal/server`

- Status: aceito
- Data: 2026-11-02

## Contexto

A issue #513 pede que cada pessoa ordene os servidores de que participa na barra
lateral da esquerda (arrastando e soltando) e crie pastas/grupos de servidores
com nome definido e editável, recolhíveis em grade 2×2 como no Discord. A
organização é privada da pessoa e não afeta outros membros do servidor.

## Opções consideradas

1. **Apenas `localStorage` no cliente**: simples, mas perde a ordem e as pastas
   ao trocar de navegador/computador ou reinstalar o app.
2. **Colunas `position` e `folder_id` em `server_members` + tabela
   `server_folders`**: mistura associação e permissões do servidor com
   preferência visual privada da barra lateral, obrigando entrada, saída,
   expulsão e exclusão de servidor a renumerar posições e limpar pastas vazias.
3. **Documento de layout por usuário (`user_server_layouts` com JSONB de itens
   `server` | `folder`) dentro de `internal/server`, reconciliado com a lista
   real de servidores do usuário** (como `guild_folders` nas preferências do
   Discord): uma única leitura/gravação atômica em `GET/PUT /users/me/server-layout`,
   com publicação em tempo real via `SendToUser` (`server:layout`) e função pura
   de reconciliação no backend e no cliente.

## Decisão

Escolhemos a **opção 3**, dentro de `internal/server` (e no cliente num store
próprio `serverLayoutStore` em `features/servers/`, sem adicionar campos ao
`serverStore`). O layout é uma lista ordenada de entradas de topo: servidor
avulso (`kind: "server"`) ou pasta (`kind: "folder"`, com `id`, `name` até 40
caracteres e `server_ids`). Na leitura e no cliente, a função pura de
reconciliação descarta servidores de que a pessoa não faz mais parte, remove
duplicatas, desfaz pastas vazias e acrescenta no fim os servidores novos. Além
do arrastar e soltar (reordenar antes/depois e soltar no centro para agrupar em
pasta), o menu de contexto da barra lateral permite criar pasta, mover para cima
ou para baixo, tirar da pasta, renomear e desfazer pasta por teclado e toque.

## Consequências

- Entrar, sair, ser expulso ou apagar servidor continua intocado: a
  reconciliação mantém o trilho consistente sem acoplamento extra.
- A organização sincroniza entre janelas abertas e dispositivos da mesma conta,
  com cache em `localStorage` para abrir já na ordem certa e estado recolhido
  por pasta salvo localmente.
- O app mobile recebe a mesma ordem e pastas pela API quando exibir pastas no
  trilho.

## Fontes

- Discord User Settings / `guild_folders` layout tree e drag-and-drop acessível:
  https://discord.com/blog/how-discord-resizes-150-million-images-every-day (arquitetura de cliente e guild folders)
- WAI-ARIA Authoring Practices — Drag-and-Drop / Keyboard Accessible Reordering.
