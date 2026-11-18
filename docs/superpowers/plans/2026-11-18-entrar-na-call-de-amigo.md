# Entrar na call de um amigo pela coluna "Ativo agora": plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o card de "Ativo agora" mostra servidor, canal e quem está na call; clicar nele entra na call do amigo.

**Architecture:** tudo no frontend. Os cards saem de `serverCalls` (callStore, só leitura); o nome do servidor vem de `serverStore.servers` e o do canal de `useCallChannelName`. O clique chama `joinVoiceChannel` (que já trata sala trancada, troca de canal e "já estou aqui") por uma função pura com dependências injetadas, e depois navega.

**Tech Stack:** React + Zustand + Tailwind v4 (tokens), Vitest com `renderToStaticMarkup`.

**Spec:** `docs/superpowers/specs/2026-11-18-entrar-na-call-de-amigo-design.md`

## Global Constraints

- Caminhos relativos a `frontend/src/renderer/src/`. Testes: `cd frontend && npx vitest run <arquivo>`; a cada ciclo, `node scripts/affected-tests.mjs loop` (raiz).
- Textos exatos: `<Servidor> · <canal>`; o canal sem nome vira `Canal de voz`; `1 na call` / `N na call`; `aria-label` = `Entrar na call de <amigo> em <canal>`; até 5 avatares e depois `+N`.
- Nada de campo novo no `callStore`, `chatStore` ou `serverStore` (god stores). Sem dependência nova.
- Ícone só de `shared/ui/icons` (`VolumeIcon`), `Avatar` de `shared/ui`, cores e tamanhos por tokens, `focus-ring` no botão.
- CRAP ≤ 15 em toda função tocada. Commits em português e convencionais, **sem** `Co-Authored-By`. O commit estrutural (Task 1) é separado.
- A coluna continua `hidden xl:block`; nada muda abaixo de 1280 px nem no `mobile/`.

## Review Focus

1. Amigo em call de um servidor que não está mais em `serverStore.servers` (acabou de sair): o card usa `Servidor` como nome e não quebra (Task 2, `voiceCardLine`).
2. Nome do canal ainda carregando (`useCallChannelName` → `null`): mostra `Canal de voz`, inclusive no `aria-label` (Task 2).
3. O mesmo amigo aparece em dois canais (estado velho entre eventos): um card só, o do primeiro canal (Task 2, `friendsInVoice`).
4. Call sem `server_id` ou `channel_id` (não dá para navegar): não vira card (Task 2).
5. Falha ao entrar que não é `Error` (rejeição com string/objeto): toast com `Falha ao conectar ao canal de voz.` e sem navegar (Task 3).

---

### Task 1: extrair a pilha de avatares do cartão do servidor (estrutural)

**Files:**
- Create: `features/servers/components/VoiceAvatarStack.tsx`
- Modify: `features/servers/components/ServerHoverCard.tsx` (o bloco `-space-x-1.5` de `ServerHoverCardBody`)
- Test: `features/servers/components/ServerHoverCard.test.tsx` (já existe; tem que continuar verde sem mudanças)

**Interfaces:**
- Produces: `export function VoiceAvatarStack({ people, ringClass }: { people: VoiceMember[]; ringClass: string }): React.JSX.Element | null`. Ele usa `summarizeVoicePeople` (5 avatares e depois `+N`), cada avatar com `size={24}` e `className={\`rounded-full ring-2 ${ringClass}\`}`, e devolve `null` sem ninguém. O `role="img"`/`aria-label` continua no `ServerHoverCardBody` (fora da pilha).

- [ ] **Step 1:** rodar `npx vitest run src/renderer/src/features/servers/components/ServerHoverCard.test.tsx`. Esperado: PASS (linha de base).
- [ ] **Step 2:** criar `VoiceAvatarStack` movendo o JSX dos avatares + `+N` de `ServerHoverCardBody`; o `ServerHoverCardBody` passa a usar `<VoiceAvatarStack people={people} ringClass="ring-[var(--bg-floating)]" />`.
- [ ] **Step 3:** rodar o mesmo teste. Esperado: PASS, mesmo HTML.
- [ ] **Step 4:** commit `refactor(servidores): extrai a pilha de avatares de voz do cartão do servidor`.

### Task 2: dados do card (lib pura)

**Files:**
- Modify: `features/friends/lib/onlineFriends.ts` (`friendsInVoice`)
- Create: `features/friends/lib/activeVoiceCopy.ts`
- Test: `features/friends/lib/onlineFriends.test.ts`, `features/friends/lib/activeVoiceCopy.test.ts`

**Interfaces:**
- Consumes: `voicePeople` e `VoiceMember` de `features/call/lib/voiceServer`; `CallStateResponse` de `features/call/api/calls`.
- Produces:
  - `export interface FriendInVoice { friend: PublicUser; serverId: string; channelId: string; people: VoiceMember[] }`
  - `export function friendsInVoice(friends: PublicUser[], serverCalls: Record<string, CallStateResponse>): FriendInVoice[]`: na ordem de `friends`; ignora a call sem `call.server_id` ou `call.channel_id`; um amigo em dois canais vale só o primeiro canal encontrado; `people = voicePeople([entry])`.
  - `export function voiceCardLine(serverName: string | null | undefined, channelName: string | null | undefined): string` → `"<servidor> · <canal>"`, com os fallbacks `Servidor` e `Canal de voz` (nomes com `trim()`).
  - `export function inCallCount(n: number): string` → `"1 na call"`, `"4 na call"`.
  - `export function joinFriendCallLabel(friendName: string, channelName: string | null | undefined): string` → `"Entrar na call de Ana em Geral"`; sem canal: `"... em Canal de voz"`.

- [ ] **Step 1: testes falhando.** Em `onlineFriends.test.ts`, trocar os testes de `friendsInVoice` por:
  - `'devolve servidor, canal e quem está na call'`: a call `{ call: { server_id: 's1', channel_id: 'ch1' }, participants: [{ user_id: 'a', display_name: 'Ana' }, { user_id: 'x', username: 'xis' }] }` e os amigos `[a, b]` → `[{ friend: a, serverId: 's1', channelId: 'ch1', people: [{ id: 'a', name: 'Ana', avatarUrl: null }, { id: 'x', name: 'xis', avatarUrl: null }] }]`.
  - `'dois amigos no mesmo canal viram dois itens'` → length 2, mesmo `channelId`.
  - `'amigo em dois canais aparece uma vez'` → length 1.
  - `'ignora call sem server_id ou channel_id'` → `[]`.
  - `'sem chamadas, ninguém'` → `[]`.
  Em `activeVoiceCopy.test.ts`: `voiceCardLine('Os Brabos', 'Geral') === 'Os Brabos · Geral'`; `voiceCardLine(undefined, null) === 'Servidor · Canal de voz'`; `voiceCardLine('  ', ' ') === 'Servidor · Canal de voz'`; `inCallCount(1) === '1 na call'`; `inCallCount(4) === '4 na call'`; `joinFriendCallLabel('Ana', 'Geral') === 'Entrar na call de Ana em Geral'`; `joinFriendCallLabel('Ana', null) === 'Entrar na call de Ana em Canal de voz'`.
- [ ] **Step 2:** rodar `npx vitest run src/renderer/src/features/friends/lib`. Esperado: FAIL (formato antigo / módulo inexistente).
- [ ] **Step 3:** implementar as quatro funções acima. O `ActiveNow.tsx` usa `friendsInVoice`: ajustar o mapeamento para `item.friend` (`key={item.friend.id}`) para o typecheck passar; o visual muda na Task 4.
- [ ] **Step 4:** rodar de novo. Esperado: PASS. `cd frontend && yarn typecheck` sem erros.
- [ ] **Step 5:** commit `feat(amigos): dados de servidor, canal e participantes para o Ativo agora`.

### Task 3: ação de entrar na call do amigo

**Files:**
- Create: `features/call/lib/joinFriendCall.ts`, `features/call/hooks/useJoinFriendCall.ts`
- Test: `features/call/lib/joinFriendCall.test.ts`

**Interfaces:**
- Produces:
  - `export interface JoinFriendCallDeps { join: (channelId: string) => Promise<void>; navigate: (route: string) => void; toastError: (msg: string) => void }`
  - `export async function joinFriendCall(target: { serverId: string; channelId: string }, deps: JoinFriendCallDeps): Promise<void>`: `await join(channelId)` → `navigate(\`/servers/${serverId}/channels/${channelId}\`)`; em caso de erro, `toastError(errorText(err, 'Falha ao conectar ao canal de voz.'))` (`errorText` de `features/servers/lib/channelSidebar`) e não navega. Nunca rejeita.
  - `export function useJoinFriendCall(): (target: { serverId: string; channelId: string }) => void`: liga `useCallStore((s) => s.joinVoiceChannel)`, `useNavigate()` e `showToast.error`.

- [ ] **Step 1: testes falhando** em `joinFriendCall.test.ts`, com `vi.fn()` para as deps:
  - `'entra e abre a tela do canal'`: `join` resolve → `join` chamado com `'ch1'`, `navigate` com `'/servers/s1/channels/ch1'`, `toastError` não chamado.
  - `'erro com mensagem vira toast e não navega'`: `join` rejeita `new Error('Você já está em uma chamada.')` → `toastError('Você já está em uma chamada.')`, `navigate` não chamado.
  - `'erro sem mensagem usa o texto padrão'`: `join` rejeita `'x'` → `toastError('Falha ao conectar ao canal de voz.')`.
- [ ] **Step 2:** rodar `npx vitest run src/renderer/src/features/call/lib/joinFriendCall.test.ts`. Esperado: FAIL (módulo inexistente).
- [ ] **Step 3:** implementar `joinFriendCall` e o hook.
- [ ] **Step 4:** rodar de novo. Esperado: PASS.
- [ ] **Step 5:** commit `feat(call): entrar na call do canal de um amigo`.

### Task 4: card clicável no "Ativo agora"

**Files:**
- Create: `features/friends/components/ActiveVoiceFriendCard.tsx` (sai de `ActiveNow.tsx`)
- Modify: `features/friends/components/ActiveNow.tsx`
- Test: `features/friends/components/ActiveVoiceFriendCard.test.tsx`

**Interfaces:**
- Consumes: `FriendInVoice`, `voiceCardLine`, `inCallCount`, `joinFriendCallLabel` (Task 2); `useJoinFriendCall` (Task 3); `VoiceAvatarStack` (Task 1); `useCallChannelName(serverId, channelId)` de `features/call/hooks/useCallChannelName`.
- Produces: `export default function ActiveVoiceFriendCard({ item, serverName, onJoin }: { item: FriendInVoice; serverName: string | undefined; onJoin: (target: { serverId: string; channelId: string }) => void }): React.JSX.Element`.

Layout (modelo A): `<button type="button">` com a classe `focus-ring w-full cursor-pointer rounded-lg border border-subtle bg-floating p-3 text-left transition-colors hover:bg-fg/5`, `aria-label` = `joinFriendCallLabel`. Linha 1: avatar 32 + nome (`StyledName`, `truncate`). Linha 2: `VolumeIcon` `h-3.5 w-3.5` + `voiceCardLine` (`truncate text-ds-xs text-muted`). Linha 3: `VoiceAvatarStack` (`ringClass="ring-[var(--bg-floating)]"`) + `inCallCount(item.people.length)`. Os filhos visuais ficam `aria-hidden` (o rótulo é o `aria-label`).

- [ ] **Step 1: testes falhando** (`renderToStaticMarkup`, com mocks no estilo de `ConversationRow.test.tsx`: `useUserLook`, `StyledName`, `Avatar`, e `useCallChannelName` → `'Geral'` ou `null`):
  - `'mostra servidor, canal e quantos estão na call'` → o HTML contém `Os Brabos · Geral` e `4 na call`.
  - `'é um botão com rótulo para leitor de tela'` → contém `type="button"`, `aria-label="Entrar na call de Ana em Geral"` e `focus-ring`.
  - `'sem nome do canal ainda, mostra Canal de voz'` (mock → `null`) → contém `Os Brabos · Canal de voz`.
  - `'mais de 5 pessoas mostra +N'` (7 pessoas) → contém `+2`.
- [ ] **Step 2:** rodar `npx vitest run src/renderer/src/features/friends/components/ActiveVoiceFriendCard.test.tsx`. Esperado: FAIL (módulo inexistente).
- [ ] **Step 3:** implementar o card; no `ActiveNow`, ler `useServerStore((s) => s.servers)`, achar o nome por `item.serverId`, criar `const join = useJoinFriendCall()` e renderizar `<ActiveVoiceFriendCard key={item.friend.id} item={item} serverName={...} onJoin={join} />`. Remover o card antigo de `ActiveNow.tsx`.
- [ ] **Step 4:** rodar de novo + `node scripts/affected-tests.mjs loop`. Esperado: PASS.
- [ ] **Step 5:** `node scripts/check-design.mjs` sem piorar e a skill `web-design-guidelines` em `ActiveVoiceFriendCard.tsx`; conferir no `yarn dev:web` em 1280 px e numa tela larga (nomes longos truncam) e que abaixo de 1280 px a coluna continua escondida.
- [ ] **Step 6:** commit `feat(amigos): entrar na call do amigo pelo Ativo agora`.

### Task 5: fechamento

- [ ] **Step 1:** `node scripts/crap.mjs` (comparar com `crap-antes.md` do scratchpad) e `node scripts/affected-tests.mjs pr`. Esperado: tudo verde, nenhuma função tocada acima de 15.
- [ ] **Step 2:** atualizar `docs/ATIVIDADE.md`? Não: o "Ativo agora" é presença de voz, não atividade. Nenhuma doc muda além da spec e deste plano; commit `docs: spec e plano de entrar na call do amigo`.
- [ ] **Step 3:** teste manual com 2 contas (roteiro na spec, § Verificação).
