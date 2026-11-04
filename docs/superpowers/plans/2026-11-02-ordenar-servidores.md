# Plano: Ordenar servidores e pastas na barra lateral (#513)

- Data: 2026-11-02
- ADR: [0049-ordem-e-pastas-de-servidores.md](../../adr/0049-ordem-e-pastas-de-servidores.md)
- Branch: `feat/ordenar-servidores`

## Resumo

Permitir que cada pessoa organize os servidores de que participa na barra
lateral da esquerda (`ServerRailList`), reordenando via drag-and-drop (e pelo
menu de contexto para teclado/toque) e agrupando servidores em pastas com nome
definido e editável, recolhíveis em grade 2×2 como no Discord.

## Arquivos e responsabilidades

### Backend (`backend/`)
- `migrations/000187_user_server_layouts.up.sql` e `.down.sql`: tabela
  `user_server_layouts (user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, items JSONB NOT NULL DEFAULT '[]', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`.
- `internal/server/rail_layout.go` + `internal/server/rail_layout_test.go`:
  modelo `RailLayoutItem` (`kind`: `"server"` | `"folder"`, `server_id`, `id`,
  `name`, `server_ids`), normalização/validação e reconciliação pura com os IDs
  dos servidores atuais do usuário, mais serviço `RailLayoutService` que salva e
  publica `server:layout` via `SendToUser`.
- `internal/server/rail_layout_repository.go`: `GetRailLayout` e `SetRailLayout`
  em Postgres (`user_server_layouts`).
- `internal/server/rail_layout_handler.go` + `internal/server/rail_layout_handler_test.go`:
  handlers `GET /users/me/server-layout` e `PUT /users/me/server-layout`.
- `internal/server/routes.go` e `cmd/wire_core.go`: registro das rotas.

### Frontend (`frontend/src/renderer/src/`)
- `shared/ui/icons/nav.tsx`: `FolderIcon` (ícone de pasta preenchido).
- `features/servers/lib/serverRailLayout.ts` + `.test.ts`: tipos e funções puras
  para reconciliar o layout com `Server[]`, mover item no topo, mover servidor
  dentro/fora de pasta, agrupar dois servidores ou colocar servidor numa pasta,
  criar pasta, renomear pasta, desfazer pasta e agregar `ServerRailView` (selos
  de não lidas/menções, voz e ativo) de uma pasta recolhida.
- `features/servers/lib/serverRailDrop.ts` + `.test.ts`: cálculo puro de zonas
  de soltar (`before`, `inside`, `after`) no arrasto de servidor ou pasta, e
  aplicação da operação correspondente sobre o layout.
- `features/servers/api/serverLayout.ts` + `.test.ts`: cliente REST
  (`getServerLayout`, `saveServerLayout`).
- `features/servers/store/serverLayoutStore.ts` + `.test.ts`: store Zustand
  dedicado (sem tocar `serverStore`) com persistência otimista, cache local,
  estado de pastas recolhidas e sincronização por evento WS `server:layout`.
- `features/servers/hooks/useServerRailDrag.ts`: hook de drag-and-drop para os
  itens e pastas do trilho.
- `features/servers/components/ServerFolderItem.tsx` + `.test.tsx`: pasta de
  servidores recolhida (grade 2×2 de miniaturas + selos agregados + hover card)
  e expandida (pílula vertical com cabeçalho de pasta + `ServerRailItem`s).
- `features/servers/components/ServerFolderModal.tsx`: modal (`shared/ui/Modal`)
  para criar ou editar o nome de uma pasta de servidores.
- `features/servers/components/ServerRailContextMenu.tsx`: menu de contexto de
  servidor ou pasta (Notificações, Criar pasta, Mover para pasta, Tirar da
  pasta, Mover para cima/baixo, Editar nome da pasta, Desfazer pasta), acessível
  por clique direito/toque longo e teclado.
- `features/servers/components/ServerRailItem.tsx`, `ServerRailList.tsx`,
  `hooks/useServerRailSync.ts`, `store/serverEvents.ts`: integração com o trilho.

## Tarefas (TDD)

1. **Backend — domínio e validação (`rail_layout.go` + `rail_layout_test.go`)**:
   testar normalização de nomes, remoção de duplicatas, reconciliação com
   servidores do usuário e publicação WS; implementar até ficar verde.
2. **Backend — repositório, handler e rotas (`rail_layout_repository.go`,
   `rail_layout_handler.go`, `rail_layout_handler_test.go`, `routes.go`,
   `wire_core.go`, migration `000187`)**: testar `GET/PUT /users/me/server-layout`
   com `httptest` e implementar.
3. **Frontend — lógica pura de layout e pastas (`serverRailLayout.ts` + `.test.ts`)**:
   testar reconciliação, criação/edição/remoção de pasta, reordenação no topo e
   dentro de pasta, entrada/saída de pasta e agregação de selos/voz da pasta.
4. **Frontend — lógica pura de drag-and-drop (`serverRailDrop.ts` + `.test.ts`)**:
   testar detecção de zona (`before` / `inside` / `after`) e transformação do
   layout ao soltar servidor sobre servidor, sobre pasta, dentro de pasta ou
   entre itens do topo.
5. **Frontend — API, store e eventos WS (`serverLayout.ts`, `serverLayoutStore.ts`,
   `serverEvents.ts` + testes)**: testar atualização otimista, rollback em erro,
   recolher/expandir pasta e recebimento de `server:layout`.
6. **Frontend — UI (`FolderIcon`, `ServerFolderItem`, `ServerFolderModal`,
   `ServerRailContextMenu`, `ServerRailItem`, `ServerRailList`) + testes**:
   renderização estática e interativa, responsividade (360/768/1280 px) e
   conformidade com `check-design.mjs`.
7. **Testes E2E integrados de ponta a ponta e pipeline `affected-tests pr`**:
   exercitar backend + store + componentes integrados (regressão, funcionalidade
   e integração) e rodar `node scripts/affected-tests.mjs pr`.
