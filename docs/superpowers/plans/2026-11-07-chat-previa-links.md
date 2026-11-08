# Prévia de links no chat: plano de implementação

> Para agentes: execute com `superpowers:executing-plans` e, em cada tarefa,
> `superpowers:test-driven-development` (teste falhando pelo motivo certo →
> código mínimo → verde). Rode `node scripts/affected-tests.mjs loop` a cada ciclo.

**Objetivo:** cartão de prévia (estilo Discord) embaixo dos links das mensagens,
YouTube tocando no chat e X do autor para remover as prévias.

**Arquitetura:** abordagem B da [spec](../specs/2026-11-07-chat-previa-links-design.md):
o app pede `GET /api/link-previews?url=` quando a mensagem aparece; o domínio novo
`internal/linkpreview` busca com um cliente HTTP blindado (anti-SSRF), lê as tags
com `golang.org/x/net/html` ([ADR 0060](../../adr/0060-x-net-html-na-previa-de-links.md)),
guarda por URL (24 h) e serve a imagem pelo próprio servidor. A supressão é uma
coluna em `messages` e uma rota própria em `internal/message/suppress_embeds.go`.
No app, a feature nova `features/linkpreview` (store próprio) e uma linha no
`MessageContent`.

**Stack:** Go (Gin, pgx, x/net/html), React + Zustand + Tailwind, Electron (main).

## Baseline (antes de mexer)

- CRAP dos arquivos existentes que serão tocados: nenhuma função tocada acima
  de 15 (`MessageContent` 12; `message_scan.go` ≤ 7; os ❌ de `repository.go` e
  `main/index.ts` são de funções que **não** serão tocadas: só a variável
  `messageColumns` e uma linha de setup mudam).
- God files: `internal/message/handler.go` (480 linhas) **não** é tocado (a rota
  nova vai para `suppress_embeds.go`); `chatStore` não ganha campo (a remoção
  aplica a resposta com o `withUpdatedMessage` que já existe).
- `main/index.ts` (389 linhas): só a chamada do módulo novo `security/youtubeReferer.ts`.

## Migrations

- `000199_create_link_previews.{up,down}.sql`: tabela `link_previews` (url PK,
  site_name, title, description, image_id uuid, color, youtube_id, failed,
  fetched_at) + índice em `fetched_at`.
- `000200_messages_embeds_suppressed.{up,down}.sql`: `messages.embeds_suppressed
  boolean NOT NULL DEFAULT false`.
- (000198 está reservado para outra feature paralela.)

## Tarefas

### Commit estrutural (sem mudar comportamento)

**T0. `go.mod`: `golang.org/x/net` de indireta para direta** (mesma versão v0.59.0,
ADR 0060). Feito junto com o primeiro uso (T2), já que o `go mod tidy` só move
quando há import.

### Backend: domínio `internal/linkpreview`

**T1. `safeclient.go` (cliente blindado)** — testes primeiro (`safeclient_test.go`):
- recusa `http://127.0.0.1/`, `http://10.0.0.1/`, `http://169.254.169.254/`,
  `http://[::1]/`, `http://[::ffff:127.0.0.1]/`, `http://100.64.0.1/` (Control do dialer);
- recusa `ftp://`, porta 8080, usuário na URL;
- redirecionamento de um servidor liberado para `http://10.0.0.1/` → recusa;
- mais de 3 redirecionamentos → erro;
- corpo de 2 MB → lê só 1 MB; `Content-Type: application/json` → `ErrNotHTML`;
- `User-Agent: SalinhaBot/1.0 (+prévia de links)`.
- Implementação: `checkAddr(netip.AddrPort)` (portas 80/443 e IP global, fora de
  privado/CGNAT/reservados, IPv4-mapeado desfeito) no `net.Dialer.Control`;
  `Transport.Proxy = nil`; `CheckRedirect` revalida a URL; `Timeout` 5 s. Teste
  injeta uma exceção só para o `AddrPort` do `httptest.Server`.

**T2. `parse.go` (HTML → página)** — testes com `testdata/*.html`: og completo,
só `<title>`, imagem relativa (resolvida contra a URL final), `theme-color`
válido/ inválido, sem nada (vazio), entidades, `<title>` dentro de `<svg>`
ignorado, cortes de 256/350/100 caracteres.

**T3. `youtube.go`** — tabela: `watch?v=`, `youtu.be/`, `shorts/`, `m.`, id
inválido, outro host.

**T4. `url.go` (`NormalizeURL`)** — tabela: esquema/host minúsculos, porta
padrão removida, fragmento removido, recusa outro esquema, porta, usuário, URL
longa, host vazio.

**T5. `service.go`** — com fakes em memória: cache acerta (sem buscar), validade
24 h, falha guardada (sem buscar de novo), página sem nada vira falha, duas
chamadas simultâneas = uma busca (`testing/synctest`), imagem que não é imagem
pelos bytes é apagada e o cartão sai sem imagem, sem espaço em disco não baixa.

**T6. `repository.go` + migration 000199** — teste de banco
(`TEST_DATABASE_URL`): grava, acha, regrava (upsert), apaga vencidos e lista ids
de imagem em uso.

**T7. `handler.go` / `routes.go`** — sem login 401, URL inválida 400, cache
acertado não conta no limite, 31º pedido sem cache no minuto → 429, sem prévia
→ 204, imagem: id inválido 404, arquivo que não é imagem 404, imagem com
`nosniff` + CSP sandbox + cache.

**T8. `janitor.go`** — apaga linhas vencidas e arquivos sem linha mais velhos
que 1 h; temporários e recentes ficam.

**T9. `cmd/wire_link_previews.go`** + chamada em `wire()`.

### Backend: suprimir prévias (`internal/message`)

**T10. Coluna + JSON** — migration 000200, `EmbedsSuppressed` no `Message`,
`m.embeds_suppressed` no fim de `messageColumns` e no scan (teste do scan
atualizado).

**T11. `suppress_embeds.go`** (serviço + handler + rotas próprias, nada em
`handler.go`) — testes: só o autor (403 `not_author` para outro), mensagem de
outra sala 404, publica `message:update` com `embeds_suppressed`, repetir não
publica de novo. Repositório em `suppress_embeds_repository.go`. Ligação em
`wire_chat.go`.

### Frontend

**T12. `features/linkpreview/lib/previewLinks.ts`** — até 3 links, sem repetir;
ignora convites nossos, `<url>`, blocos ``` e `inline`. Detecção de código
local e mínima, com comentário: troca pelo leitor de `features/chat/lib/markdown`
quando a branch `feat/chat-markdown` entrar.

**T13. `lib/embedView.ts`** — `safeEmbedColor` (#rgb/#rrggbb), `youtubeEmbedSrc`
(id validado, `youtube-nocookie`, `autoplay=1`).

**T14. `api/linkPreviews.ts`** e **`store/linkPreviewStore.ts`** — cache por URL,
uma busca por URL, 204 = sem cartão guardado, erro passageiro tenta de novo;
`removeEmbeds(message)` chama a rota e aplica a resposta com `withUpdatedMessage`.

**T15. Componentes** — `LinkEmbed`, `YouTubeEmbed`, `RemoveEmbedsDialog`,
`MessageEmbeds`; `MessageContent` ganha `<MessageEmbeds message={message} />`;
`embeds_suppressed?: boolean` no `Message`. Teste de comportamento do
`MessageEmbeds` (X só para o autor, confirma e chama a remoção; suprimida não
renderiza; play troca por iframe).

**T16. `src/main/security/youtubeReferer.ts`** — `Referer` = origem do primeiro
servidor do build só para `https://www.youtube-nocookie.com/*`; teste com sessão
falsa. Chamada no `index.ts`.

### Fechamento

**T17.** CRAP ≤ 15 nas funções tocadas, `check-structure`, `check-design`,
`web-design-guidelines` nos componentes, revisão de código e
`node scripts/affected-tests.mjs pr` verde.

## Commits

1. `docs: spec, ADR 0060 e plano da prévia de links`
2. `feat(linkpreview): ...` (domínio backend + go.mod)
3. `feat(chat): remover prévias da mensagem (backend)`
4. `feat(linkpreview): cartões de prévia e YouTube no chat`
5. `feat(linkpreview): Referer do YouTube no app instalado`
