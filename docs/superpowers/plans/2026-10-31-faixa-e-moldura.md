# Faixa e moldura no perfil — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a pessoa ativa uma faixa (o banner ou uma imagem própria) atrás do nome nas listas e envia uma moldura transparente para o avatar, com prévia "Parada"/"Animando" e lista leve (quadro parado, GIF só no hover).

**Architecture:** três colunas novas em `users` e um pacote `internal/cosmetics` que monta, em SQL, a URL efetiva da faixa e a moldura (`cosmetics.Look`, JSON achatado). O `Look` entra nas consultas de membros, conversas, mensagens e no `PublicProfile`. O upload reaproveita `ProfileHandler.upload`. No front: `Avatar` ganha a moldura, um componente `Nameplate` novo entra nas linhas e um modal "Faixa e moldura" em Configurações › Perfil aplica na hora.

**Tech Stack:** Go 1.26 + Gin + pgx + Postgres; React + Zustand + Tailwind v4 + Vitest.

**Spec:** `docs/superpowers/specs/2026-10-31-faixa-e-moldura-design.md`

## Global Constraints

- CRAP ≤ 15 em toda função tocada (`node scripts/crap.mjs --files ...`).
- Arquivo tocado com mais de 400 linhas sai menor do PR: `server/repository.go` (639) e `conversation/repository.go` (451) encolhem na Task 1.
- Sem dependência nova. Sem campos novos em `callStore`, `chatStore` e `serverStore`.
- UI só com `shared/ui` (`Button`, `IconButton`, `CloseButton`, ícones SVG), tokens de cor/texto/raio e `focus-ring`. `scripts/check-design.mjs` verde.
- Responsivo de 360 px para cima; toque e teclado. Em telas < 480 px, as prévias "Parada" e "Animando" ficam empilhadas.
- Textos aprovados (só estes): "Faixa e moldura", "Faixa", "Moldura", "Desligada", "Usar o banner", "Imagem própria", "Alterar moldura", "Remover moldura", "Remover faixa", "Parada", "Animando".
- Modos da faixa: `off` (padrão), `banner`, `custom`. Moldura com 1,2× o lado do avatar. Recortes: faixa 6:1 com saída 600×100; moldura 240×240 com transparência.
- Commits em português, convencionais, **sem `Co-Authored-By` nem atribuição a IA**. Commit estrutural separado do de comportamento.
- Go fora do PATH: use `GO=/caminho/go.exe`. Formatar só os arquivos mudados (checkout CRLF).

## Review Focus

1. **Lista de membros com muitos GIFs**: abrir um servidor não pode baixar nenhum GIF de faixa ou moldura, só os `/static`. → teste na Task 6 (`Nameplate` sem hover não renderiza `<img>` animada) e na Task 5 (`Avatar` com `animate="hover"` só monta a moldura animada no hover).
2. **Modo `banner` sem banner, ou banner removido depois**: a faixa some, sem quebrar. → teste de banco na Task 2.
3. **Apagar a imagem própria com o modo `custom`**: o modo volta para `off`. Com o modo `banner`, apagar a imagem guardada mantém `banner`. → Task 3.
4. **Moldura PNG/WebP/GIF transparente**: o recorte não pode pôr fundo preto. → Task 7.
5. **Apelido no servidor e faixa juntos**: a faixa aparece também quando o nome mostrado é o apelido. → Task 6, teste de `MemberRow`.

---

### Task 1: Extrair as consultas de membros (estrutural, sem mudar comportamento)

**Files:**
- Create: `backend/internal/server/member_repository.go` (move `ListMembers`, `FindMemberByUserID` e as consultas de membros vizinhas que usam `legacyRoleColumn`/`memberRoleIDsColumn`, junto com essas constantes)
- Create: `backend/internal/conversation/member_repository.go` (move `Members` e o bloco do `json_agg` de membros como `const membersJSONColumn`, usado de volta em `repository.go`)
- Modify: `backend/internal/server/repository.go`, `backend/internal/conversation/repository.go`

- [ ] **Step 1:** mover o código sem alterar nenhuma linha de SQL. Os métodos continuam em `*Repository` (mesmo pacote).
- [ ] **Step 2:** `cd backend && go build ./... && go vet ./... && go test ./internal/server ./internal/conversation`. Esperado: verde. `wc -l` dos dois `repository.go` abaixo de 639 e 451.
- [ ] **Step 3:** `node scripts/check-structure.mjs` verde.
- [ ] **Step 4: Commit** `refactor: separa as consultas de membros de server e conversation`

### Task 2: Banco e pacote `cosmetics`

**Files:**
- Create: `backend/migrations/000183_faixa_moldura.up.sql` (o `ALTER TABLE` do spec) e `.down.sql` (`DROP COLUMN` das três)
- Create: `backend/internal/cosmetics/cosmetics.go`, `cosmetics_test.go`, `cosmetics_db_test.go` (no molde de `user/theme_db_test.go`)

**Interfaces — Produces:**
```go
package cosmetics
var Modes = []string{"off", "banner", "custom"}
var ErrInvalid = errors.New("faixa inválida")
func ValidMode(m string) bool
// Look é o que os outros veem; embutido nos structs, sai achatado no JSON.
type Look struct {
    NameplateURL        *string `json:"nameplate_url,omitempty"`
    AvatarDecorationURL *string `json:"avatar_decoration_url,omitempty"`
}
// NameplateExpr: CASE <a>.nameplate_mode WHEN 'banner' THEN <a>.banner_url WHEN 'custom' THEN <a>.nameplate_url END
func NameplateExpr(alias string) string
// Expr: jsonb_build_object('nameplate_url', NameplateExpr(a), 'avatar_decoration_url', <a>.avatar_decoration_url), escaneável num Look
func Expr(alias string) string
```

- [ ] **Step 1: testes que falham.** `TestValidMode` (`off`/`banner`/`custom` sim; `""`, `OFF`, `x` não). `TestExprUsesAlias` (`Expr("u")` contém `u.nameplate_mode` e `u.avatar_decoration_url`). `TestLookDB` com banco: insere um usuário e, para cada caso, `SELECT `+Expr("u")+` FROM users u WHERE id=$1` escaneado em `Look`:
  - `off` com banner → `NameplateURL == nil`
  - `banner` com `banner_url='/api/profile-media/b'` → `"/api/profile-media/b"`
  - `banner` com `banner_url NULL` → `nil`
  - `custom` com `nameplate_url='/api/profile-media/n'` → `"/api/profile-media/n"`
  - `avatar_decoration_url='/api/profile-media/d'` → `AvatarDecorationURL` igual
- [ ] **Step 2:** `go test ./internal/cosmetics` → FAIL (pacote/colunas não existem).
- [ ] **Step 3:** escrever a migration e o pacote.
- [ ] **Step 4:** `go test ./internal/cosmetics` → PASS.
- [ ] **Step 5: Commit** `feat(perfil): colunas e pacote cosmetics para faixa e moldura`

### Task 3: Usuário — ler, gravar e rotas

**Files:**
- Modify: `backend/internal/user/model.go` (`User` e `PublicProfile` embutem `cosmetics.Look`; `User` ganha `NameplateMode string \`json:"-"\`` e `NameplateCustomURL *string \`json:"-"\``; `SelfUser` expõe `nameplate_mode` e `nameplate_custom_url`; `Public()` copia o `Look`)
- Modify: `backend/internal/user/repository.go` (`userColumns` + `scanUser`: `nameplate_mode, nameplate_url, avatar_decoration_url`; depois do scan, `Look` é calculado em Go por `lookOf(u)`, com a mesma regra do `NameplateExpr`). Para o arquivo não passar de 400 linhas, mover `swapMedia` e os `Set*` para `user/media_repository.go`.
- Create: `backend/internal/user/media_repository.go`, `backend/internal/user/cosmetics_handler.go`
- Modify: `backend/internal/user/profile_service.go` (interface `profileRepo` + métodos), `routes.go`
- Test: `backend/internal/user/cosmetics_handler_test.go`, `cosmetics_db_test.go`

**Interfaces — Produces:**
```go
// repo
SetNameplate(ctx, id string, url *string) (*User, *string, error)   // url != nil → modo 'custom'; url == nil e modo 'custom' → 'off'
SetDecoration(ctx, id string, url *string) (*User, *string, error)
SetNameplateMode(ctx, id, mode string) (*User, error)               // 'custom' com nameplate_url NULL → ErrInvalidProfile
// service: os mesmos nomes; os três publicam user:update (via swap/publish)
// handler (métodos de ProfileHandler, em cosmetics_handler.go)
UploadNameplate, DeleteNameplate, UploadDecoration, DeleteDecoration, SetNameplateMode
// rotas (ProfileRoutes)
POST/DELETE /users/me/nameplate, POST/DELETE /users/me/decoration, PUT /users/me/nameplate-mode {"mode": string}
```

- [ ] **Step 1: testes que falham** (no estilo de `profile_handler_test.go` / `theme_db_test.go`):
  - `POST /users/me/nameplate` com PNG → 200, `nameplate_mode=="custom"`, `nameplate_url` e `nameplate_custom_url` iguais à URL nova.
  - `DELETE /users/me/nameplate` com o modo `custom` → `nameplate_mode=="off"`, sem `nameplate_url`.
  - `PUT nameplate-mode {"mode":"banner"}` depois do upload → `nameplate_url == banner_url`, `nameplate_custom_url` mantida. Com o modo `banner`, `DELETE /users/me/nameplate` → continua `banner`.
  - `PUT nameplate-mode {"mode":"custom"}` sem imagem → 400. `{"mode":"x"}` → 400.
  - `POST /users/me/decoration` com GIF + `static` → `avatar_decoration_url` começa com `/api/profile-media/a_`.
  - Cada mudança chama `PublishUserUpdate` com o `Look` novo (fake de `ProfileEvents`).
  - Trocar a imagem própria apaga o arquivo antigo (como no banner).
- [ ] **Step 2:** `go test ./internal/user -run 'Nameplate|Decoration'` → FAIL.
- [ ] **Step 3:** implementar. `SetNameplate` faz numa transação: lê a URL antiga `FOR UPDATE`, grava a nova e ajusta o modo (CASE em SQL). Reaproveitar `h.upload(c, h.service.SetNameplate)` e `h.remove`.
- [ ] **Step 4:** `go test ./internal/user` → PASS; `go vet ./...`.
- [ ] **Step 5:** `wc -l backend/internal/user/repository.go` < 400 (o arquivo encolhe).
- [ ] **Step 6: Commit** `feat(perfil): upload de faixa e moldura e modo da faixa`

### Task 4: Faixa e moldura nas listas (backend)

**Files:**
- Modify: `backend/internal/server/model.go` (`ServerMember` embute `cosmetics.Look`), `server/member_repository.go` (`, `+cosmetics.Expr("u")` depois do `namestyle.Expr` e `&m.Look` no Scan, nas duas consultas)
- Modify: `backend/internal/conversation/model.go` (`OtherUser` embute `Look`), `conversation/member_repository.go` (`Members` com `Expr`; no `json_agg`, as chaves `'nameplate_url', `+cosmetics.NameplateExpr("u")+`, 'avatar_decoration_url', u.avatar_decoration_url`)
- Modify: `backend/internal/message/model.go` (`Author` ganha o campo `AvatarDecorationURL *string` com a tag json `avatar_decoration_url,omitempty`), `message/repository.go` (`u.avatar_decoration_url` e `ru.avatar_decoration_url` em `messageColumns`, logo depois de cada `namestyle.Expr`, e no Scan)
- Test: o `_db_test` de cada pacote que já cobre essas consultas (ou um novo `cosmetics_db_test.go` por pacote)

- [ ] **Step 1: testes que falham:** membro com modo `banner` e banner aparece com `nameplate_url` em `ListMembers` e `FindMemberByUserID`; `Members` e a lista de conversas trazem `nameplate_url`/`avatar_decoration_url`; a mensagem traz a moldura do autor; membro com `off` não tem a chave `nameplate_url` no JSON.
- [ ] **Step 2:** `go test ./internal/server ./internal/conversation ./internal/message` → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** os mesmos testes → PASS; `go build ./... && go vet ./...`.
- [ ] **Step 5: Commit** `feat(perfil): faixa e moldura nas listas de membros, DMs e mensagens`

### Task 5: Front — tipos, `useUserLook` e moldura no `Avatar`

**Files:**
- Create: `frontend/src/renderer/src/features/profile/lib/cosmetics.ts` + `.test.ts`
- Modify: `features/profile/api/users.ts` (`PublicProfile` + `nameplate_url?`, `avatar_decoration_url?`), `features/auth/store/authStore.ts` (tipo `User`: mesmos campos + `nameplate_mode?`, `nameplate_custom_url?`), `features/servers/api/servers.ts`, `features/chat/api/conversations.ts`, `features/chat/api/messages.ts` (campos opcionais)
- Modify: `features/profile/store/profileStore.ts` (`useUserLook`)
- Modify: `shared/ui/Avatar.tsx`; Test: `shared/ui/Avatar.test.tsx` (criar se não existir)

**Interfaces — Produces:**
```ts
// cosmetics.ts
export const NAMEPLATE_MODES = ['off', 'banner', 'custom'] as const
export type NameplateMode = (typeof NAMEPLATE_MODES)[number]
export const DECORATION_SCALE = 1.2
export function resolveNameplateMode(raw: unknown): NameplateMode // desconhecido → 'off'
// profileStore
useUserLook(userId, fallback: { name: string; avatarUrl?: string | null; nameplateUrl?: string | null; decorationUrl?: string | null })
  : { name: string; avatarUrl: string | null; nameplateUrl: string | null; decorationUrl: string | null }
// Avatar: nova prop opcional `decorationUrl?: string | null`
```

- [ ] **Step 1: testes que falham:**
  - `NAMEPLATE_MODES` igual a `Modes` do Go (ler `backend/internal/cosmetics/cosmetics.go` no teste, como faz `nameStyle.test.ts`).
  - `resolveNameplateMode('x') === 'off'`.
  - `useUserLook` prefere o `profileStore` ao fallback também para `nameplateUrl` e `decorationUrl`.
  - `Avatar` com `decorationUrl` estática: um `<img>` com `aria-hidden`, largura/altura = `round(size*1.2)`, centralizado (`left/top` negativos de `(1.2-1)/2*size`).
  - `Avatar` com moldura GIF (`a_`) e `animate="hover"`: sem hover, só a `/static`; depois de `mouseEnter` no avatar, aparece a animada; depois de `mouseLeave`, ela sai do DOM.
  - Sem `decorationUrl`, nenhum nó a mais.
- [ ] **Step 2:** `npx vitest run src/renderer/src/shared/ui/Avatar.test.tsx src/renderer/src/features/profile/lib/cosmetics.test.ts` → FAIL.
- [ ] **Step 3:** implementar. A moldura animada usa um hook novo `useHoverActive()` em `shared/hooks/useHoverActive.ts`, que devolve `{ active, bind }` (`bind` = `onMouseEnter`/`onMouseLeave`/`onFocus`/`onBlur`). A `<img>` animada é renderizada só com `active`. A Task 6 reaproveita o hook.
- [ ] **Step 4:** os testes → PASS.
- [ ] **Step 5: Commit** `feat(perfil): moldura no avatar`

### Task 6: Front — componente `Nameplate` nas linhas

**Files:**
- Create: `frontend/src/renderer/src/features/profile/components/Nameplate.tsx` + `.test.tsx`
- Modify: `features/servers/components/ServerMemberList.tsx` (`MemberRow` recebe `nameplateUrl?`/`decorationUrl?` e o chamador passa os campos do membro), `features/chat/components/GroupMemberRow.tsx`, `features/friends/components/ConversationRow.tsx`; os avatares dessas linhas recebem `decorationUrl`

**Interfaces — Produces:**
```tsx
// Atrás do conteúdo da linha. A linha precisa de `relative` e passa `active` (hover/foco da linha, via useHoverActive).
export default function Nameplate(props: { url: string | null | undefined; active: boolean; fade: string /* cor do fundo, ex.: 'var(--bg-members)' */; forceAnimate?: boolean }): React.JSX.Element | null
```

- [ ] **Step 1: testes que falham:**
  - `url` nulo → `null`.
  - URL `a_` com `active=false` → uma `<img>` só, com `/static`, `loading="lazy"` e `decoding="async"`.
  - `active=true` → a `<img>` animada (sem `/static`).
  - `forceAnimate` → a animada sem hover (para a prévia).
  - Imagem não animada → nunca uma segunda `<img>`.
  - O degradê de leitura vem de `fade`: `linear-gradient(90deg, <fade> …, transparent)`, sem `filter`.
  - `MemberRow` com `nickname` e `nameplateUrl` → a faixa aparece.
- [ ] **Step 2:** `npx vitest run src/renderer/src/features/profile/components/Nameplate.test.tsx` → FAIL.
- [ ] **Step 3:** implementar e encaixar nas três linhas (conteúdo da linha com `relative z-[1]` por cima da faixa).
- [ ] **Step 4:** `node scripts/affected-tests.mjs loop` → verde.
- [ ] **Step 5: Commit** `feat(perfil): faixa atrás do nome nas listas`

### Task 7: Front — recorte de faixa e moldura

**Files:**
- Modify: `features/settings/components/ImageCropModal.tsx` (`ImageKind = 'avatar' | 'banner' | 'nameplate' | 'decoration'`; `FRAME`: nameplate `{ width: 480, height: 80 }`, decoration `{ width: 300, height: 300 }`; `OUTPUT` com as constantes novas)
- Modify: `features/profile/lib/imageCrop.ts` (`NAMEPLATE_OUTPUT = { width: 600, height: 100 }`, `DECORATION_OUTPUT = { width: 240, height: 240 }`)
- Test: `features/profile/lib/gifCrop.test.ts`, `cropMedia.test.ts`

- [ ] **Step 1: testes que falham:**
  - Recortar um GIF com cor transparente (montar com `gifEncoder` dos testes) mantém o índice transparente: o quadro decodificado tem pixel com alfa 0 no mesmo lugar.
  - O recorte parado sai `image/webp` (com alfa).
  - O recorte da moldura não pinta fundo antes de `drawImage`.
- [ ] **Step 2:** `npx vitest run src/renderer/src/features/profile/lib/gifCrop.test.ts` → FAIL (ou PASS, se já preserva: aí o teste fica como regressão e o passo 3 é só a constante).
- [ ] **Step 3:** implementar o necessário.
- [ ] **Step 4:** os testes → PASS.
- [ ] **Step 5: Commit** `feat(perfil): recorte de faixa e moldura`

### Task 8: Front — modal "Faixa e moldura" com prévia

**Files:**
- Modify: `features/profile/api/users.ts`:
  ```ts
  export type CosmeticImageKind = 'nameplate' | 'decoration'
  export function uploadCosmetic(kind: CosmeticImageKind, file: Blob, staticFrame?: Blob, onProgress?: (p: number) => void): Promise<User> // uploadImage(`/users/me/${kind}`, kind, …)
  export function deleteCosmetic(kind: CosmeticImageKind): Promise<User>
  export function setNameplateMode(mode: NameplateMode): Promise<User> // PUT /users/me/nameplate-mode
  ```
  O segundo argumento de `uploadImage` é só o nome do arquivo no multipart (o campo é sempre `file`/`static`): passar `kind`, como o avatar faz.
- Create: `features/settings/components/profile/cosmetics/CosmeticsTile.tsx` (o tile em `ProfileTiles`, título "Faixa e moldura", miniatura da linha), `CosmeticsModal.tsx` (usa `EditModalShell`), `NameplatePreview.tsx` (as duas linhas "Parada"/"Animando"), `features/settings/lib/cosmeticsPreview.ts` + `.test.ts`
- Modify: `features/settings/components/profile/tiles/ProfileTiles.tsx` (só inclui o tile), `modals/ProfileEditModal.tsx` (`ProfileModalId` + `'cosmetics'`)

**Interfaces — Produces:**
```ts
// cosmeticsPreview.ts: a URL de faixa que a prévia mostra (rascunho local por cima do salvo)
export function previewNameplate(mode: NameplateMode, bannerUrl: string | null, custom: MediaChange, savedCustom: string | null): string | null
export function hasAnimation(...urls: (string | null)[]): boolean // alguma é GIF (a_) ou rascunho local animado
```

- [ ] **Step 1: testes que falham:**
  - `previewNameplate('off', …) === null`; `'banner'` → `bannerUrl`; `'custom'` com `set` → `previewUrl`; `'custom'` com `keep` → `savedCustom`.
  - `hasAnimation` só com URL `a_` ou rascunho `animated`.
  - Modal: escolher "Usar o banner" chama `setNameplateMode('banner')` e grava o `User` no `authStore`; "Imagem própria" abre o seletor de arquivo e depois o `ImageCropModal` com `kind="nameplate"`; "Remover moldura" chama `deleteCosmetic('decoration')`.
  - Prévia com GIF → duas linhas, rotuladas "Parada" e "Animando" (a segunda com `forceAnimate` na faixa e `animate="always"` no avatar); sem GIF → só "Parada".
  - As opções da faixa são um grupo de rádio acessível por teclado (setas).
- [ ] **Step 2:** `npx vitest run src/renderer/src/features/settings` → FAIL.
- [ ] **Step 3:** implementar. Layout das prévias: `flex flex-col gap-2 min-[480px]:flex-row`. Usar só os componentes de `shared/ui`.
- [ ] **Step 4:** testes → PASS; `yarn typecheck`.
- [ ] **Step 5: Commit** `feat(perfil): editor de faixa e moldura com prévia parada e animando`

### Task 9: Verificação final

- [ ] **Step 1:** `node scripts/affected-tests.mjs pr` → verde (afetados + vet/typecheck + estrutura + design + CRAP). Guardar a saída.
- [ ] **Step 2:** `node scripts/crap.mjs` sem função tocada acima de 15.
- [ ] **Step 3:** subir o app (`scripts/server-up.sh` + `yarn dev:web`) e conferir a olho, em 360 px e em tela larga:
  - um servidor com membros com faixa GIF: na aba Network, nenhum GIF até o hover;
  - a prévia "Parada"/"Animando";
  - a moldura no chat;
  - o nome legível sobre uma faixa clara.
- [ ] **Step 4:** perguntar ao usuário antes do push e do PR (para `develop`).
