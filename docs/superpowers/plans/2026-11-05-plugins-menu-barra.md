# Ligar plugins pela barra do canal — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o membro liga/desliga plugins por um quebra-cabeça fixo na barra do canal; as Configurações → Plugins voltam a ser só de quem gerencia o servidor.

**Architecture:** só frontend (`frontend/src/renderer/src`). O `PluginMenu` sai de `PluginHeaderButtons.tsx` para arquivo próprio e ganha interruptores (mesma `toggleAction`); o controle de "pedido em andamento" (`useBusy`) sai de `PluginsSettingsSection.tsx` para um hook compartilhado. `headerPlugins` passa a cortar em 2 ícones. A seção das Configurações perde o interruptor e a nav perde a flag `everyone`.

**Tech Stack:** React 19, Zustand, Tailwind v4, Vitest (`renderToStaticMarkup`, padrão dos testes atuais).

**Spec:** `docs/superpowers/specs/2026-11-05-plugins-menu-barra-design.md`

## Global Constraints

- Quebra-cabeça só aparece com **≥ 1 plugin instalado** no servidor; sem instalado, a barra não muda.
- **No máximo 2** ícones de plugins ligados ao lado do quebra-cabeça (os 2 primeiros na ordem da lista).
- Aba Plugins das Configurações: só com `Perm.MANAGE_SERVER` (dono/Administrador já vêm somados em `perms`).
- Legenda aprovada: `Instalar só deixa o plugin disponível. Cada membro liga o que quiser pelo quebra-cabeça na barra do canal.`
- Componentes `shared/ui` (`IconButton`, `Switch`), tokens, `focus-ring`; alvo de toque ≥ 40 px (`max-md:size-10` nos botões, `min-h-10` nas linhas). Funciona em 360 px.
- CRAP ≤ 15 em toda função tocada. Commit estrutural separado do de comportamento. Commits em português, sem atribuição a IA.
- Loop: `node scripts/affected-tests.mjs loop`; teste único: `cd frontend && npx vitest run <arquivo>`.

## Review Focus

- Plugin desinstalado enquanto o menu está aberto: a linha some e, se era o último, o quebra-cabeça some e o menu fecha sem erro (o `pruneOpen` já cuida do painel). → teste na Task 3.
- Desligar pelo menu o plugin cujo painel está aberto: o painel fecha (já vem de `findOpenPlugin`, que só acha ligados). → teste na Task 3 (`findOpenPlugin` com plugin desligado retorna null — cobrir se ainda não houver).
- Clique duplo rápido no interruptor: um pedido só (`runExclusive`). → teste na Task 2.
- 3+ ligados: só 2 ícones, e o 3º abre pelo nome no menu. → teste na Task 3.
- Membro sem permissão não vê "Configurações do servidor" no menu do servidor. → testes na Task 1.

---

### Task 1: Aba Plugins só para quem gerencia o servidor

**Files:**
- Modify: `features/servers/lib/serverSettingsNav.ts` (tirar o campo `everyone` da interface, do item `plugins` e do `visibleServerSections`; item vira `{ id: 'plugins', label: 'Plugins', anyOf: Perm.MANAGE_SERVER }`, mesma posição)
- Test: `features/servers/lib/serverSettingsNav.test.ts`, `features/servers/lib/serverMenu.test.ts`, `features/servers/components/ServerRailMenu.test.tsx`, `features/servers/components/ServerRailList.test.tsx`

- [ ] **Step 1: Ajustar os testes para o comportamento novo** — desfazer nos 4 arquivos de teste o que `e74cb70b`, `dba914b4` e `56ad26a4` mudaram, com `plugins` só onde há `MANAGE_SERVER`:
  - `ids(DEFAULT_EVERYONE)` → `[]`, `canOpenServerSettings(DEFAULT_EVERYONE)` e `(0)` → `false`; `resolveServerSection(0,'overview')` → `null`; `visibleServerSections(0,false,true)` → `['events']`.
  - `ids(ALL_PERMISSIONS)` → `['overview','tag','look','roles','members','bans','audit','plugins','level']`; `ids(Perm.MANAGE_SERVER)` → `['overview','tag','look','plugins','level']`; `MANAGE_ROLES` → `['roles','members','level']`; `KICK_MEMBERS`/`MANAGE_NICKNAMES` → `['members','level']`; `BAN_MEMBERS` → `['members','bans','level']`; `VIEW_AUDIT_LOG` → `['audit']`; `CHANGE_NICKNAME` → `[]`; o `mod` mantém `plugins` (tem MANAGE_SERVER).
  - `serverMenu.test.ts`: `['roles','members','level']` e membro comum com `canOpenSettings: false`. `ServerRailMenu`/`ServerRailList`: membro comum **não** contém `Configurações do servidor`.
- [ ] **Step 2: Rodar e ver falhar** — `cd frontend && npx vitest run src/renderer/src/features/servers` → FAIL nas expectativas acima.
- [ ] **Step 3: Implementar** a mudança em `serverSettingsNav.ts` (comentário do item: instalar/desinstalar é de quem gerencia; cada membro liga pela barra do canal).
- [ ] **Step 4: Rodar e ver passar** — mesmo comando → PASS.
- [ ] **Step 5: Commit** — `fix(servidores): aba Plugins volta a ser só de quem gerencia o servidor`

### Task 2: Extrair `PluginMenu` e `usePluginBusy` (estrutural)

**Files:**
- Create: `features/plugins/components/PluginMenu.tsx` (o `PluginMenu` atual, sem mudança de comportamento)
- Create: `features/plugins/hooks/usePluginBusy.ts` (o `Busy`/`useBusy` atual de `PluginsSettingsSection.tsx`)
- Modify: `features/plugins/components/PluginHeaderButtons.tsx`, `features/plugins/components/PluginsSettingsSection.tsx` (importam daí)
- Test: mover o `describe('PluginMenu')` de `PluginHeaderButtons.test.tsx` para `components/PluginMenu.test.tsx`

**Interfaces — Produces:**
- `export interface PluginBusy { ids: ReadonlySet<string>; exclusive: (id: string, fn: () => Promise<void>) => Promise<void> }`
- `export function usePluginBusy(): PluginBusy`

- [ ] **Step 1:** mover o código e o teste; nenhuma linha de comportamento muda.
- [ ] **Step 2:** `cd frontend && npx vitest run src/renderer/src/features/plugins && yarn typecheck` → PASS.
- [ ] **Step 3: Commit** — `refactor(plugins): menu e controle de pedido em andamento em arquivos próprios`

### Task 3: Quebra-cabeça fixo com interruptores e no máximo 2 ícones

**Files:**
- Modify: `features/plugins/lib/headerPlugins.ts` (+ teste)
- Modify: `features/plugins/components/PluginMenu.tsx` (+ teste)
- Modify: `features/plugins/components/PluginHeaderButtons.tsx` (+ teste)

**Interfaces:**
- Consumes: `usePluginBusy()` (Task 2); `toggleAction(serverId, pluginId, enabled)` e `runExclusive` de `lib/pluginSettingsActions.ts`; `pluginIcon(icon)`; `Switch` (`checked`, `onChange`, `label`, `disabled`).
- Produces:
  - `export const MAX_HEADER_ICONS = 2` (substitui `GROUP_AT`/`shouldGroup`, que saem)
  - `export function headerPlugins(list: ServerPlugin[]): ServerPlugin[]` — os ligados, na ordem, cortados em `MAX_HEADER_ICONS`
  - `PluginMenu({ serverId, plugins, onOpen }: { serverId: string; plugins: ServerPlugin[]; onOpen: (p: ServerPlugin) => void })`

- [ ] **Step 1: Testes que falham**
  - `headerPlugins.test.ts`: `MAX_HEADER_ICONS === 2`; `headerPlugins([a✓, b✗, c✓, d✓])` → `['a','c']`; com nenhum ligado → `[]`.
  - `PluginMenu.test.tsx`: `role="menu"`; uma linha por plugin **instalado** (ligados e desligados) com nome, descrição e um `role="switch"` com `aria-label` do nome e `aria-checked` igual a `enabled`; nome de plugin ligado é `<button>` (`role="menuitem"`), de desligado não é botão; linhas com `min-h-10`.
  - `PluginMenu.test.tsx` (interação, como os testes de ação de `PluginsSettingsSection.test.tsx`): mudar o interruptor chama `usePluginsStore.getState().toggle('s1', id, true|false)`; dois cliques seguidos antes de resolver → `toggle` chamado 1 vez.
  - `PluginHeaderButtons.test.tsx` (reescrever os casos de grupo):
    - nenhum instalado → nenhum `<button>`;
    - instalado e nenhum ligado → 1 botão `aria-label="Plugins"` com `aria-haspopup="menu"` e `max-md:size-10`;
    - 1 ligado (bola) → `Plugins` + botão `aria-label="Plugin a"` com o caminho `M12 8.3L15.52`;
    - 3 ligados → 3 botões (`Plugins` + `Plugin a` + `Plugin b`), sem `aria-label="Plugin c"`;
    - o botão `Plugins` sempre com o quebra-cabeça (sem `M12 8.3L15.52`).
- [ ] **Step 2:** `cd frontend && npx vitest run src/renderer/src/features/plugins` → FAIL pelos motivos acima.
- [ ] **Step 3: Implementar**
  - `headerPlugins` com `slice(0, MAX_HEADER_ICONS)`.
  - `PluginMenu`: cada linha = (nome clicável se ligado → `onOpen(p)`, senão texto) + descrição `truncate text-ds-xs text-muted` + `Switch` que chama `busy.exclusive(p.id, () => toggleAction(serverId, p.id, on))`, `disabled` enquanto `busy.ids.has(p.id)`. Mantém posição/tamanho atuais do menu (`w-56` pode virar `w-72 max-w-[calc(100vw-2rem)]` para caber a descrição em 360 px).
  - `PluginHeaderButtons`: retorna `null` só com `list.length === 0`; desenha sempre o `IconButton` `Plugins` (abre/fecha o menu) seguido de um `IconButton` por `headerPlugins(list)`; abrir pelo nome no menu usa o `openPlugin` existente (fecha o menu e abre o painel ancorado no quebra-cabeça). Se o menu está aberto e `list` fica vazia, nada é desenhado (menu some junto).
- [ ] **Step 4:** mesmo comando → PASS; `node scripts/crap.mjs --files <os 3 arquivos .ts/.tsx>` → todas ≤ 15.
- [ ] **Step 5: Commit** — `feat(plugins): quebra-cabeça na barra do canal liga e desliga os plugins`

### Task 4: Configurações → Plugins sem o interruptor

**Files:**
- Modify: `features/plugins/components/PluginsSettingsSection.tsx` (+ teste)

- [ ] **Step 1: Testes que falham** em `PluginsSettingsSection.test.tsx`:
  - admin: sem `role="switch"`; com `Desinstalar`; título `Instalados neste servidor`; legenda exata da Global Constraints.
  - remover o caso "membro: sem Instalar/Desinstalar, com a dica e o Switch" e o trecho do `Switch` em "Instalar chama install…"; membro sem `MANAGE_SERVER` → a seção desenha `null` (a nav já não a mostra; guarda contra rota direta).
- [ ] **Step 2:** `cd frontend && npx vitest run src/renderer/src/features/plugins/components/PluginsSettingsSection.test.tsx` → FAIL.
- [ ] **Step 3: Implementar** — `InstalledRow` sem `Switch`; tirar ramos `canManage` de título/legenda/botão (seção só para quem gerencia); `useEffect` sempre carrega o catálogo. Comentário do componente atualizado.
- [ ] **Step 4:** PASS; `node scripts/crap.mjs --files src/renderer/src/features/plugins/components/PluginsSettingsSection.tsx`.
- [ ] **Step 5: Commit** — `feat(plugins): configurações do servidor só instalam e desinstalam`

### Task 5: Verificação final

- [ ] `node scripts/affected-tests.mjs pr` verde (afetados + typecheck + estrutura + design + CRAP).
- [ ] Conferência visual no `yarn dev:web` em 360 px e largura cheia: quebra-cabeça aparece só com plugin instalado, interruptor liga e o ícone surge ao lado, 3º ligado só no menu, Esc fecha e devolve o foco.
