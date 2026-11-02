# Plugins da comunidade, parte 1 (base): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ficha de plugin com aprovação do time, instalação por servidor (Gerenciar servidor), escolha de cada membro e o painel em iframe isolado ao lado dos pinados.

**Architecture:** Domínio novo `backend/internal/plugin` (model → repository → service → handler → routes), ligado em `cmd/wire_plugins.go`, com evento `plugins:changed` na sala `server:`. Feature nova `frontend/src/renderer/src/features/plugins` com store próprio, aba nas configurações do servidor e popover com iframe `sandbox`. A CSP ganha `frame-src https:`. O main do Electron não muda.

**Tech Stack:** Go 1.26, Gin, pgx/Postgres, Hub WebSocket; React, Zustand, Tailwind v4, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-02-plugins-base-design.md` (e o ADR `docs/adr/0049-plugins-em-iframe-isolado.md`).

## Global Constraints

- Sem dependência nova (go.mod, package.json).
- CRAP ≤ 15 em toda função tocada (`node scripts/crap.mjs`). Arquivo tocado com mais de 400 linhas sai menor.
- Não adicionar campos a `serverStore`, `chatStore` nem `callStore`. Não adicionar métodos a `call/service.go`.
- O app Android (`mobile/`) não muda.
- Quem instala e desinstala: `permission.ManageServer`. Não criar bit de permissão novo (`1<<0`..`1<<30` estão ocupados).
- O time é `TECH_TEAM_USER_IDS` (`envList`, como em `cmd/wire_engagement.go:40`).
- URL do painel: `https://`, host não vazio, até 2048 caracteres. Nome de 1 a 40 caracteres, descrição de 1 a 120 (contando runas, depois de `TrimSpace`).
- Status: `pending`, `approved`, `rejected`. Transições válidas: `pending→approved`, `pending→rejected`, `approved→rejected`, `rejected→approved`.
- iframe: `sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"`, `referrerPolicy="no-referrer"`, sem `allow=`.
- Textos de UI só os da tabela "Textos aprovados" da spec, exatos. `aria-label` e toasts fora da tabela precisam de aprovação antes do commit: liste-os no relatório da tarefa.
- Design: ícones de `shared/ui/icons`, `Button`/`IconButton`/`CloseButton`, `Switch` de `shared/ui`, tokens `text-ds-*`, `focus-ring`. Responsivo de 360 px a telas largas.
- Commits em português, convencionais, **sem** `Co-Authored-By` nem qualquer atribuição a IA.
- A cada ciclo: `node scripts/affected-tests.mjs loop`. Go fora do PATH: `GO="/c/Program Files/Go/bin/go.exe"`.

## Review Focus

1. **Membro que sai do servidor ou é expulso:** as escolhas dele somem (FK de `member_plugins` para `server_members` com `ON DELETE CASCADE`). Teste no repository (Task 2).
2. **Ficha retirada com o servidor ainda instalado:** some da lista do servidor e do catálogo de quem não é do time; reaprovar faz voltar com as escolhas antigas. Teste no repository (Task 2).
3. **Painel aberto quando o plugin é desinstalado (evento chega):** o painel fecha e o botão some. Teste no `PluginHeaderButtons` (Task 7).
4. **URL com esquema enganoso** (`javascript:`, `http:`, `https:///x`, `HTTPS://` maiúsculo, espaços): só `https` com host é aceito; `HTTPS://x.com` é aceito (o esquema é normalizado). Teste em `ValidateDraft` (Task 1).
5. **Trocar de servidor com o painel aberto:** o painel fecha (estado local do componente, chave pelo `serverId`). Teste no `PluginHeaderButtons` (Task 7).

---

### Task 1: Modelo e regras puras do plugin (backend)

**Files:**
- Create: `backend/internal/plugin/model.go`, `backend/internal/plugin/model_test.go`

**Interfaces:**
- Produces:
  - `type Status string` com `StatusPending = "pending"`, `StatusApproved = "approved"`, `StatusRejected = "rejected"`.
  - `type Plugin struct { ID, Name, Description, PanelURL, AuthorID, AuthorUsername string; Status Status; ReviewNote *string; ReviewedBy *string; CreatedAt, UpdatedAt time.Time }` com tags JSON snake_case (`panel_url`, `author_username`, `review_note`...). `ReviewedBy` vai com `json:"-"`.
  - `type ServerPlugin struct { Plugin; Enabled bool `json:"enabled"` }`.
  - `type Draft struct { Name, Description, PanelURL string }`.
  - `func ValidateDraft(d Draft) (Draft, error)`: devolve o draft com `TrimSpace` e URL normalizada (`url.Parse` + `String()`).
  - `func CanTransition(from, to Status) bool`.
  - Erros: `ErrInvalidName`, `ErrInvalidDescription`, `ErrInvalidURL`, `ErrInvalidTransition`, `ErrNotFound`, `ErrNotApproved`, `ErrForbidden` (mensagens em português).
  - `func marshalEvent(typ string, payload any) []byte` (formato `{"type":..., "payload":...}`, igual ao `emoji/model.go:68`) e `const EventChanged = "plugins:changed"`.

- [ ] **Step 1: Write the failing tests** em `model_test.go`, todos tabelados:
  - `TestValidateDraftURL`: aceita `https://placar.exemplo.com/painel` e `HTTPS://x.com` (a saída tem `https://x.com`). Recusa com `ErrInvalidURL`: `http://x.com`, `javascript:alert(1)`, `https:///x`, `""`, `"ftp://x.com"` e `"https://" + strings.Repeat("a", 2048)`.
  - `TestValidateDraftNameAndDescription`: o nome `"  Placar  "` vira `"Placar"`; o nome vazio dá `ErrInvalidName`; com 41 runas também (`strings.Repeat("é", 41)`), e com 40 passa. Descrição com 121 runas dá `ErrInvalidDescription`, e vazia também.
  - `TestCanTransition`: `true` nas quatro transições válidas das Global Constraints e `false` em `approved→approved`, `rejected→pending`, `approved→pending` e `pending→pending`.
- [ ] **Step 2:** `cd backend && go test ./internal/plugin -run 'TestValidateDraft|TestCanTransition'`. Esperado: FAIL (não compila).
- [ ] **Step 3:** Implementar `model.go` com as assinaturas acima.
- [ ] **Step 4:** O mesmo comando. Esperado: PASS.
- [ ] **Step 5:** `git commit -m "feat(plugin): ficha do plugin e validação"`

### Task 2: Migration e repository (backend)

**Files:**
- Create: `backend/migrations/000187_create_plugins.up.sql`, `backend/migrations/000187_create_plugins.down.sql`
- Create: `backend/internal/plugin/repository.go`, `backend/internal/plugin/repository_db_test.go`

**Interfaces:**
- Consumes: os tipos da Task 1.
- Produces: `func NewRepository(db *pgxpool.Pool) *Repository`, com:
  - `Create(ctx, authorID string, d Draft) (Plugin, error)` (status `pending`)
  - `Get(ctx, id string) (Plugin, error)` (`ErrNotFound`)
  - `List(ctx, includeAll bool) ([]Plugin, error)`: só `approved` quando `includeAll` é falso; ordena por `name`.
  - `SetReview(ctx, id string, status Status, note *string, reviewerID string) (Plugin, error)`
  - `Install(ctx, serverID, pluginID, userID string) error` (idempotente: `ON CONFLICT DO NOTHING`)
  - `Uninstall(ctx, serverID, pluginID string) error` (apaga também as linhas de `member_plugins` daquele par)
  - `ListServer(ctx, serverID, userID string) ([]ServerPlugin, error)`: instalados **e** `approved`, com `enabled` de `userID`, na ordem de `installed_at`.
  - `SetEnabled(ctx, serverID, userID, pluginID string, on bool) error`. Ligar insere só se existir `server_plugins` com a ficha `approved` (`INSERT ... SELECT ... WHERE EXISTS`). Desligar apaga. Nunca dá erro por estar fora dessas condições.
  - `ServersWith(ctx, pluginID string) ([]string, error)`
  - Sempre preenche `AuthorUsername` com `JOIN users`.

**SQL da migration (up):**
- `plugins`: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `name TEXT NOT NULL`, `description TEXT NOT NULL`, `panel_url TEXT NOT NULL`, `author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`, `status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected'))`, `review_note TEXT`, `reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL`, `created_at` e `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.
- `server_plugins`: `server_id UUID REFERENCES servers(id) ON DELETE CASCADE`, `plugin_id UUID REFERENCES plugins(id) ON DELETE CASCADE`, `installed_by UUID REFERENCES users(id) ON DELETE SET NULL`, `installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `PRIMARY KEY (server_id, plugin_id)`.
- `member_plugins`: `server_id`, `user_id`, `plugin_id`, `PRIMARY KEY (server_id, user_id, plugin_id)`, `FOREIGN KEY (server_id, user_id) REFERENCES server_members(server_id, user_id) ON DELETE CASCADE`, `FOREIGN KEY (server_id, plugin_id) REFERENCES server_plugins(server_id, plugin_id) ON DELETE CASCADE` (desinstalar já limpa as escolhas pelo banco).
- O down faz `DROP` na ordem inversa.

- [ ] **Step 1: Write the failing tests** (`repository_db_test.go`, com o helper no molde de `internal/audit/repository_db_test.go`: `TEST_DATABASE_URL`, `t.Skip` sem ele, usuários, servidor e membros com `t.Cleanup`):
  - `TestRepositoryCatalogShowsOnlyApproved`: cria duas fichas e aprova uma. `List(false)` tem só a aprovada, `List(true)` tem as duas, e `AuthorUsername` vem preenchido.
  - `TestRepositoryEnableNeedsInstalledApproved`: `SetEnabled(on)` sem instalar → `ListServer` vazio. Instalar e ligar → `Enabled` é `true` para B e `false` para C.
  - `TestRepositoryUninstallClearsChoices`: depois de ligado, `Uninstall` e `Install` de novo → `Enabled` é `false`.
  - `TestRepositoryWithdrawHidesAndReapproveRestores` (Review Focus 2): ligado → `SetReview(rejected)` → `ListServer` vazio. `SetReview(approved)` → volta com `Enabled` `true`.
  - `TestRepositoryLeavingServerClearsChoices` (Review Focus 1): ligado → `DELETE FROM server_members` de B → não sobra nenhuma linha de B em `member_plugins`.
  - `TestRepositoryServersWith`: instalado em dois servidores → devolve os dois ids.
- [ ] **Step 2:** `cd backend && TEST_DATABASE_URL=... go test ./internal/plugin -run TestRepository`. Esperado: FAIL (não compila). Sem banco local, suba com `scripts/server-up.sh` e rode a migration pelo boot do backend. Sem banco disponível, registre no relatório que os `db_test` pularam.
- [ ] **Step 3:** Escrever a migration e o `repository.go`.
- [ ] **Step 4:** O mesmo comando. Esperado: PASS.
- [ ] **Step 5:** `git commit -m "feat(plugin): tabelas e repository dos plugins"`

### Task 3: Service (backend)

**Files:**
- Create: `backend/internal/plugin/service.go`, `backend/internal/plugin/service_test.go`

**Interfaces:**
- Consumes: o `Repository` da Task 2, por uma interface `store` local com os mesmos métodos.
- Produces:
  - `type PermissionChecker interface { Require(ctx context.Context, serverID, userID string, want int64) error; ServerPerms(ctx context.Context, serverID, userID string) (int64, error) }` (o `permission.Service` satisfaz)
  - `type Publisher interface { BroadcastToRoom(room string, event []byte) }`
  - `func NewService(store store, perms PermissionChecker, pub Publisher, techIDs []string) *Service`
  - `Create(ctx, userID string, d Draft) (Plugin, error)`, que valida com `ValidateDraft`
  - `Review(ctx, userID, pluginID string, to Status, note *string) (Plugin, error)`: se não for do time, `ErrForbidden`; se a transição for inválida, `ErrInvalidTransition`. Depois de gravar, emite `plugins:changed` em `server:<id>` para cada id de `ServersWith`.
  - `Catalog(ctx, userID string) ([]Plugin, error)`: o time recebe `includeAll` `true`. Nunca devolve `nil`.
  - `ServerPlugins(ctx, serverID, userID string) ([]ServerPlugin, error)`: `ServerPerms` antes (não membro → `permission.ErrNotMember`). Nunca devolve `nil`.
  - `Install(ctx, serverID, userID, pluginID string) error`: `Require(ManageServer)`. Ficha que não está `approved` dá `ErrNotApproved`. Emite em `server:<serverID>`.
  - `Uninstall(ctx, serverID, userID, pluginID string) error`: `Require(ManageServer)` e emite.
  - `SetEnabled(ctx, serverID, userID, pluginID string, on bool) error`: `ServerPerms` antes. Emite só em `user:<userID>`.
  - O payload do evento é `{"server_id": "<id>"}`.

- [ ] **Step 1: Write the failing tests** (`service_test.go`, com fakes de `store`, `PermissionChecker` e `Publisher` que registram as salas):
  - `TestReviewOnlyTech`: quem não é do time recebe `ErrForbidden` e o store não é chamado.
  - `TestReviewInvalidTransition`: `approved→approved` dá `ErrInvalidTransition`.
  - `TestReviewBroadcastsToInstalledServers`: com `ServersWith` = `["s1","s2"]`, as salas `server:s1` e `server:s2` recebem `{"type":"plugins:changed","payload":{"server_id":"s1"}}` (e `s2`).
  - `TestInstallRequiresManageServer`: o fake devolve `permission.ErrMissingPermission` e esse erro sobe.
  - `TestInstallRejectsNotApproved`: ficha `pending` dá `ErrNotApproved`.
  - `TestInstallAndUninstallBroadcast`: a sala é `server:s1`.
  - `TestServerPluginsNonMember`: `ServerPerms` devolve `ErrNotMember` e o erro sobe.
  - `TestSetEnabledBroadcastsToUserOnly`: só a sala `user:u1`.
  - `TestCatalogTechSeesAll`: o time chama o store com `includeAll` `true`; os outros, com `false`.
  - `TestCreateValidates`: URL `http://` dá `ErrInvalidURL` e o store não é chamado.
- [ ] **Step 2:** `go test ./internal/plugin -run 'Test(Review|Install|ServerPlugins|SetEnabled|Catalog|Create)'`. Esperado: FAIL.
- [ ] **Step 3:** Implementar `service.go`.
- [ ] **Step 4:** O mesmo comando. Esperado: PASS.
- [ ] **Step 5:** `git commit -m "feat(plugin): regras de aprovação, instalação e escolha do membro"`

### Task 4: Handler, rotas e wire (backend)

**Files:**
- Create: `backend/internal/plugin/handler.go`, `backend/internal/plugin/handler_test.go`, `backend/internal/plugin/routes.go`, `backend/cmd/wire_plugins.go`
- Modify: `backend/cmd/wire.go` (chamar `a.wirePlugins()` junto do `a.wireAudit()`, linha 128)

**Interfaces:**
- Consumes: `*Service` da Task 3.
- Produces: `func NewHandler(s *Service) *Handler` e `func Routes(router *gin.RouterGroup, h *Handler, authMiddleware, requireVerified gin.HandlerFunc)`. As rotas (o parâmetro do servidor é `:id`, como o `audit` usa em `/servers/:id/...`):
  - `GET /plugins` → `200 []Plugin`
  - `POST /plugins` (com `requireVerified`) com `{name, description, panel_url}` → `201 Plugin`
  - `PATCH /plugins/:pluginId/review` com `{status, note}` → `200 Plugin`
  - `GET /servers/:id/plugins` → `200 []ServerPlugin`
  - `PUT /servers/:id/plugins/:pluginId` → `204`
  - `DELETE /servers/:id/plugins/:pluginId` → `204`
  - `PUT /servers/:id/plugins/:pluginId/me` com `{enabled: bool}` → `204`
- Mapeamento de erros: primeiro o `permission.HTTPError`. Depois `ErrForbidden` → 403 `forbidden`; `ErrInvalidName`, `ErrInvalidDescription` e `ErrInvalidURL` → 400 com os códigos `invalid_name`, `invalid_description` e `invalid_url`; `ErrInvalidTransition` → 400 `invalid_transition`; `ErrNotApproved` → 400 `not_approved`; `ErrNotFound` → 404 `not_found`; o resto → 500 com `log.Printf`.
- `wire_plugins.go`: `plugin.NewService(plugin.NewRepository(a.db), a.permissionService, a.hub, envList("TECH_TEAM_USER_IDS"))` e `a.route(...)`.

- [ ] **Step 1: Write the failing tests** (`handler_test.go`, com `httptest` e o service montado sobre os fakes da Task 3; `userID` posto num middleware de teste):
  - `TestHandlerCreateInvalidURL`: `POST /plugins` com `panel_url: "http://x"` dá 400 e `{"error":"invalid_url"}`.
  - `TestHandlerInstallMissingPermission`: 403 e `missing_permission`.
  - `TestHandlerListServerEmptyIsArray`: o corpo é `[]`, não `null`.
  - `TestHandlerToggleMe`: `PUT .../me` com `{"enabled":true}` dá 204 e o fake recebe `on=true`.
- [ ] **Step 2:** `go test ./internal/plugin -run TestHandler`. Esperado: FAIL.
- [ ] **Step 3:** Implementar o handler, as rotas e o wire.
- [ ] **Step 4:** `go test ./internal/plugin && go build ./... && go vet ./internal/plugin ./cmd`. Esperado: PASS e sem saída de erro.
- [ ] **Step 5:** `git commit -m "feat(plugin): API dos plugins"`

### Task 5: CSP aceita frames https (frontend)

**Files:**
- Modify: `frontend/src/renderer/index.html:13-14` (acrescentar `frame-src https:` ao `content` da CSP)
- Modify: `frontend/src/renderer/src/shared/lib/serverUrl.ts:113-117` (`WEB_EXTRA_CSP` passa a ser só `"base-uri 'self'"`; atualizar o comentário. O `import` de `ACTIVITIES` sai se ficar sem uso.)
- Test: `frontend/src/renderer/src/shared/lib/serverUrl.test.ts`
- Modify: `docs/adr/README.md` (índice: a linha da 0049)

**Interfaces:** nenhuma nova.

- [ ] **Step 1: Write the failing tests** no `serverUrl.test.ts`:
  - `it('a CSP do index aceita frame https (plugins e atividades)')`: lê `src/renderer/index.html` com `fs.readFileSync` e espera `/frame-src https:/`.
  - Atualizar o teste do `fillCsp` com `extra: WEB_EXTRA_CSP`: a saída tem uma única ocorrência de `frame-src` (`match(/frame-src/g)?.length === 1`).
- [ ] **Step 2:** `cd frontend && npx vitest run src/renderer/src/shared/lib/serverUrl.test.ts`. Esperado: FAIL.
- [ ] **Step 3:** Fazer as duas mudanças. Conferir que todo `origins` de `src/shared/activities.ts` é `https://` (hoje: `https://krunker.io`).
- [ ] **Step 4:** O mesmo comando, mais `overlayCsp.test.ts`. Esperado: PASS.
- [ ] **Step 5:** `git commit -m "feat(plugins): CSP aceita o painel dos plugins em iframe https"`

### Task 6: API, regras puras e store (frontend)

**Files:**
- Create: `frontend/src/renderer/src/features/plugins/api/plugins.ts`
- Create: `frontend/src/renderer/src/features/plugins/lib/headerPlugins.ts` + `headerPlugins.test.ts`
- Create: `frontend/src/renderer/src/features/plugins/store/pluginsStore.ts` + `pluginsStore.test.ts`
- Create: `frontend/src/renderer/src/features/plugins/lib/pluginsEventsStart.ts` + `pluginsEventsStart.test.ts`
- Modify: `frontend/src/renderer/src/main.tsx` (chamar `startPluginsEvents()` junto do `startSessionRevoked()`, linha 61)

**Interfaces:**
- Produces:
  - `interface Plugin { id: string; name: string; description: string; panel_url: string; author_username: string; status: 'pending' | 'approved' | 'rejected' }` e `interface ServerPlugin extends Plugin { enabled: boolean }`.
  - API, com `request` de `shared/api/client`: `fetchCatalog(): Promise<Plugin[]>`, `fetchServerPlugins(serverId): Promise<ServerPlugin[]>`, `installPlugin(serverId, pluginId)`, `uninstallPlugin(serverId, pluginId)` e `setPluginEnabled(serverId, pluginId, enabled)`.
  - `headerPlugins(list: ServerPlugin[]): ServerPlugin[]` (só os `enabled`) e `const GROUP_AT = 3` com `shouldGroup(count: number): boolean`.
  - `usePluginsStore`: `{ byServer: Record<string, ServerPlugin[]>, catalog: Plugin[] | null, load(serverId): Promise<void>, loadCatalog(): Promise<void>, toggle(serverId, pluginId, enabled): Promise<void>, install(serverId, pluginId): Promise<void>, uninstall(serverId, pluginId): Promise<void> }`. O `toggle` é otimista e desfaz se der erro. `install` e `uninstall` recarregam `load(serverId)`.
  - `startPluginsEvents(): () => void`: no evento `plugins:changed`, chama `load(payload.server_id)`, mas só se esse servidor já está em `byServer`.

- [ ] **Step 1: Write the failing tests:**
  - `headerPlugins.test.ts`: filtra os `enabled`, mantém a ordem de entrada, e `shouldGroup(2) === false` e `shouldGroup(3) === true`.
  - `pluginsStore.test.ts` (API mockada com `vi.mock('../api/plugins')`): `toggle` falhando volta o `enabled` ao valor anterior; `load` guarda por servidor.
  - `pluginsEventsStart.test.ts`: um evento para servidor carregado chama `load` uma vez; para servidor não carregado, não chama.
- [ ] **Step 2:** `npx vitest run src/renderer/src/features/plugins`. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** O mesmo comando. Esperado: PASS.
- [ ] **Step 5:** `git commit -m "feat(plugins): API, store e eventos dos plugins no app"`

### Task 7: Botão na barra e painel com iframe (frontend)

**Files:**
- Modify: `frontend/src/renderer/src/shared/ui/icons/tools.tsx` (`PuzzleIcon`) e `icons/index.ts`, se ele reexportar por nome
- Create: `frontend/src/renderer/src/features/plugins/components/PluginPanel.tsx` + `PluginPanel.test.tsx`
- Create: `frontend/src/renderer/src/features/plugins/components/PluginHeaderButtons.tsx` + `PluginHeaderButtons.test.tsx`
- Modify: `frontend/src/renderer/src/features/servers/components/ChannelHeaderParts.tsx:58-87` (renderizar `<PluginHeaderButtons />` entre o botão de pinados e o "Convidar", só quando `showPins`)

**Interfaces:**
- Consumes: `usePluginsStore` e `headerPlugins`/`shouldGroup` da Task 6. O `serverId` vem de `useServerStore((s) => s.currentServer?.id)` (só leitura).
- Produces:
  - `PluginPanel({ plugin, onClose }: { plugin: ServerPlugin; onClose: () => void })`: embrulhado em `MobileSheet`. O cabeçalho tem o nome e um `CloseButton`, a linha `Plugin de @{author_username} · conteúdo de fora da Salinha` e o iframe com os atributos das Global Constraints e `title={plugin.name}`. No desktop, `w-[22.5rem] h-[30rem] max-h-[calc(100dvh-6rem)]`, posição absoluta abaixo da barra como o `PinnedMessagesPopover`. Esc e clique fora fecham, e o foco volta ao botão que abriu. Sem `load` em `LOAD_TIMEOUT_MS = 10000`, mostra `Não deu para abrir este plugin agora.` e um `Button` `Tentar de novo`, que remonta o iframe (`key` incrementada).
  - `PluginHeaderButtons()`: chama `load(serverId)` quando o servidor muda. Com 1 ou 2 plugins ligados, um `IconButton` com `PuzzleIcon` por plugin (`aria-label` e `title` iguais ao nome do plugin, `aria-expanded`). Com 3 ou mais, um botão `Plugins` que abre um menu (`role="menu"`, itens `role="menuitem"` com o nome) e, ao escolher, abre o painel. O plugin aberto é estado local; ele se fecha quando some de `headerPlugins` ou quando o `serverId` muda.

- [ ] **Step 1: Write the failing tests:**
  - `PluginPanel.test.tsx`:
    - o iframe tem `sandbox` igual a `allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox`, `src` = `panel_url` e `referrerpolicy` = `no-referrer`;
    - o texto `Plugin de @mugis · conteúdo de fora da Salinha` aparece;
    - com `vi.useFakeTimers()`, avançar 10000 ms mostra `Não deu para abrir este plugin agora.`, e clicar em `Tentar de novo` tira a mensagem;
    - Esc chama `onClose`.
  - `PluginHeaderButtons.test.tsx`, com o store pré-preenchido:
    - 0 ligados: nenhum botão;
    - 2 ligados: dois botões com `aria-label` igual ao nome;
    - 3 ligados: um botão `Plugins`, e o menu lista os três;
    - **Review Focus 3:** painel aberto e o plugin some do store (`act`) → painel desmontado;
    - **Review Focus 5:** painel aberto e o `currentServer` muda → painel desmontado.
- [ ] **Step 2:** `npx vitest run src/renderer/src/features/plugins/components`. Esperado: FAIL.
- [ ] **Step 3:** Implementar e ligar em `ChannelActions`.
- [ ] **Step 4:** O mesmo comando, mais `ChannelHeaderParts.test.tsx` e `icons.test.tsx`. Esperado: PASS.
- [ ] **Step 5:** `git commit -m "feat(plugins): botão do plugin na barra do canal e painel isolado"`

### Task 8: Aba "Plugins" nas configurações do servidor (frontend)

**Files:**
- Modify: `frontend/src/renderer/src/features/servers/lib/serverSettingsNav.ts`: id `'plugins'` e campo `everyone?: boolean` em `ServerSettingsSection`. A seção `{ id: 'plugins', label: 'Plugins', anyOf: 0, everyone: true }` entra **antes** de `level`. `visibleServerSections` mostra `everyone` sempre. Assim `canOpenServerSettings` passa a ser `true` para qualquer membro, e é de propósito: a aba é de todos.
- Test: `frontend/src/renderer/src/features/servers/lib/serverSettingsNav.test.ts`
- Modify: `frontend/src/renderer/src/features/servers/components/ServerSettingsScreen.tsx:27-35` (`plugins: PluginsSettingsSection` no `SECTION_VIEW`)
- Create: `frontend/src/renderer/src/features/plugins/components/PluginsSettingsSection.tsx` + `PluginsSettingsSection.test.tsx`

**Interfaces:**
- Consumes: `usePluginsStore` (Task 6), `useServerAccess()` (`perms`, `isOwner`), `Perm.MANAGE_SERVER` de `features/servers/lib/permissions`, e `Switch`, `Button`, `SectionHeader` de `shared/ui`.
- Produces: `PluginsSettingsSection()`. `canManage = isOwner || (perms & Perm.MANAGE_SERVER) !== 0` (confira se `serverAccess` já soma o Administrador; se não, `|| (perms & Perm.ADMINISTRATOR) !== 0`).
  - **Com `canManage`:** a seção `Instalados neste servidor` tem, por linha, nome, descrição (`truncate`), `Switch` (`label` = nome) e `Button` `Desinstalar`. Logo abaixo, a dica `Instalar só deixa o plugin disponível. Cada membro escolhe se quer usar.`. A seção `Disponíveis` lista o catálogo menos os instalados, com `Button` `Instalar`.
  - **Sem `canManage`:** a seção `Plugins deste servidor` com a dica `Ligue os que quiser ver na barra dos canais. Só muda para você.` e as linhas com `Switch`.
  - **Sem nenhum instalado:** `Nenhum plugin instalado neste servidor ainda.`.
  - **Erro de ação:** `showToast.error(actionErrorMessage(err))`, já usado em `ServerSettingsScreen`.
  - Uma coluna em qualquer largura. Os botões com `shrink-0 whitespace-nowrap`.

- [ ] **Step 1: Write the failing tests:**
  - `serverSettingsNav.test.ts`: `visibleServerSections(0)` contém `plugins`, e `canOpenServerSettings(0) === true`. A ordem com `Perm.MANAGE_SERVER` termina em `..., 'plugins', 'level'`.
  - `PluginsSettingsSection.test.tsx`:
    - **Admin:** vê `Instalados neste servidor` e `Disponíveis`; clicar em `Instalar` chama `install(serverId, id)`.
    - **Membro:** não vê `Instalar` nem `Desinstalar`, vê a dica do membro, e o `Switch` chama `toggle`.
    - **Vazio:** mostra o texto do vazio.
- [ ] **Step 2:** `npx vitest run src/renderer/src/features/servers/lib/serverSettingsNav.test.ts src/renderer/src/features/plugins/components/PluginsSettingsSection.test.tsx`. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** O mesmo comando, mais `npx vitest run src/renderer/src/features/servers`. Esperado: PASS. Se algum teste esperava "sem permissão → sem item de configurações", atualize e registre no relatório (mudança intencional da spec).
- [ ] **Step 5:** `git commit -m "feat(plugins): aba Plugins nas configurações do servidor"`

### Task 9: Verificação de ponta a ponta e pré-PR

**Files:** nenhum novo (só correções que a verificação apontar).

- [ ] **Step 1:** Seguir a "Verificação de ponta a ponta" da spec (passos 1 a 9) com o backend local e duas contas. Anotar o resultado de cada passo. Prints em 360, 768 e 1280 px do painel e da aba.
- [ ] **Step 2:** Rodar a skill `web-design-guidelines` nos componentes de `features/plugins/components` e corrigir o que for erro.
- [ ] **Step 3:** `node scripts/crap.mjs` e `node scripts/affected-tests.mjs pr`. Esperado: verde. Guardar a saída para o PR, junto do `.superpowers/crap-antes.txt`.
- [ ] **Step 4:** Mudar o ADR 0049 para `Status: aceito` e commitar o fix que a verificação pedir: `git commit -m "docs(adr): 0049 plugins em iframe isolado"`.
