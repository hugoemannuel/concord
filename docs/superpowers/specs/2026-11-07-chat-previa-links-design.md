# Prévia de links no chat (estilo Discord): design

Spec 3 de 3 da ideia "colar texto formatado e mandar arquivos como no Discord".
Irmãs: [formatação](2026-11-07-chat-markdown-design.md) e
[arquivos](2026-11-07-chat-arquivos-design.md). Independente das outras duas.
ADR: [0060 — `golang.org/x/net/html` para ler as tags das páginas](../../adr/0060-x-net-html-na-previa-de-links.md).

## Objetivo

Um link mandado no chat ganha embaixo um cartão como o do Discord: nome do
site, título clicável, descrição, imagem grande e uma faixa colorida à
esquerda (`theme-color` do site). Link do YouTube toca o vídeo dentro do chat.
O autor pode remover as prévias da mensagem com um X.

Não existe nada parecido no repo hoje.

**Sucesso:** mandar `https://www.buser.com.br/...` e ver o cartão igual ao
print de referência (título em link, descrição, imagem, faixa colorida) em
cerca de 1 s; mandar um link do YouTube, clicar no play e o vídeo tocar no
chat; o autor clicar no X, confirmar, e o cartão sumir para todos.

## Decisões (com o porquê)

1. **Só desktop e web.** Mobile fica de fora (mesma decisão da formatação).
2. **Abordagem B (escolhida pelo usuário): prévia sob demanda com cache por
   URL.** O app pede `GET /api/link-previews?url=...` quando a mensagem
   aparece; o servidor busca, guarda e responde. Alternativas descartadas:
   - A (servidor monta no envio, como o Discord): mexe no fluxo de envio, na
     edição, em evento novo de WebSocket e deixa mensagens antigas sem prévia.
   - C (app busca direto): CORS bloqueia na web e vaza o IP de quem lê.
   Vantagens da B: não toca envio/edição/WebSocket, vale para mensagens
   antigas, domínio isolado, dez leitores do mesmo link = uma busca.
3. **Cliente HTTP blindado contra SSRF** (o servidor não pode virar ponte para
   a rede interna da VPS):
   - só `http`/`https`, portas 80 e 443;
   - a checagem de IP acontece no `net.Dialer.Control` (no IP de fato
     conectado, imune a DNS rebinding): recusa loopback, privado (RFC 1918,
     `fc00::/7`), link-local (inclui `169.254.169.254`), CGNAT `100.64/10`,
     multicast, não especificado e IPv4-mapeado desses;
   - até 3 redirecionamentos, cada um revalidado; 5 s de timeout total; lê no
     máximo 1 MB do HTML; só processa `text/html`;
   - `User-Agent` próprio e genérico (`SalinhaBot/1.0 (+prévia de links)`),
     sem dados de usuário.
4. **O que é lido** (com `golang.org/x/net/html`, ADR 0060): `og:title` (ou
   `<title>`), `og:description` (ou `meta description`), `og:site_name`,
   `og:image` (resolvida contra a URL final), `theme-color`. Textos cortados
   (título 256, descrição 350, site 100 caracteres). Sem título nem descrição
   nem imagem: sem cartão.
5. **Imagem sempre pelo nosso servidor** (`GET /api/link-previews/image/:id`):
   baixada com o mesmo cliente blindado, aceita só PNG/JPEG/GIF/WebP pelos
   bytes (`media.Sniff`, kind image), até 5 MB, guardada em disco, servida com
   `nosniff` e cache. Assim o site do link não vê o IP de quem lê. A rota da
   imagem é **pública** (um `<img>` não manda `Authorization`), com id aleatório
   (UUID, não derivado da URL) e só serve imagem já baixada: ela nunca dispara
   busca, então não serve de proxy aberto. *Decisão do agente.*
6. **Cache**: tabela `link_previews` por URL normalizada, validade 24 h; falha
   também é guardada (24 h) para não martelar site fora do ar. Buscas
   simultâneas da mesma URL viram uma só (mapa de pedidos em andamento +
   mutex no service, sem dependência nova). Limpeza das linhas e imagens
   vencidas no janitor do domínio.
7. **Quais links da mensagem**: até 3 por mensagem (os primeiros), detectados
   pelo `linkify` que já existe no app. Links dentro de código (usa o leitor da
   spec 1, que entra antes na `develop`), entre
   `<...>` (Discord: `<url>` suprime a prévia) e convites da própria Salinha
   não ganham cartão. Imagem direta (`.png` etc.) fica fora desta entrega.
8. **Proteção do endpoint**: exige login; limite de 30 pedidos/min por
   usuário (cache acertado não conta), seguindo o limitador em memória que o
   `internal/auth` já usa (ver `loginguard.go`) e sem dependência nova.
9. **YouTube toca dentro do chat**, como no Discord: o cartão mostra a
   miniatura (`og:image`, pelo proxy) com botão de play; o clique troca por
   `<iframe src="https://www.youtube-nocookie.com/embed/<id>?autoplay=1">`
   com `allow="autoplay; encrypted-media; picture-in-picture; fullscreen"` e
   `referrerpolicy="strict-origin-when-cross-origin"`. O iframe só carrega no
   clique (o YouTube não vê quem só rolou o chat). O id é extraído de
   `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/` e validado
   (`[A-Za-z0-9_-]{11}`). A CSP do renderer já permite `frame-src https:`.
   **Risco a testar primeiro:** o YouTube recusa tocar sem a origem da página
   ("erro 153"), e o app instalado não roda num site. Correção: no `src/main`,
   `session.webRequest.onBeforeSendHeaders` só para `youtube-nocookie.com`
   colocando como `Referer` a origem do `VITE_SERVER_URL` do build (cada
   servidor próprio usa o seu domínio). Se mesmo assim falhar, o play abre o
   vídeo no navegador (fallback). Outros sites de vídeo: só o cartão.
10. **X para remover as prévias** (como no Discord): só o autor da mensagem
    vê; confirma e as prévias somem para todos. Guardado como coluna
    `messages.embeds_suppressed boolean NOT NULL DEFAULT false`; o campo
    `embeds_suppressed` vai no JSON da mensagem; a sala recebe a atualização
    pelo mesmo evento de mensagem editada que já existe (sem evento novo).
    Mensagem com `embeds_suppressed` não pede prévia.

## Arquitetura (arquivos e pastas)

Backend (`backend/`):

- `internal/linkpreview/` (novo domínio, padrão do repo):
  - `model.go`: `Preview{URL, SiteName, Title, Description, ImageID, Color, YouTubeID}`.
  - `safeclient.go`: cliente HTTP blindado (decisão 3), testável com
    resolvedor/dialer injetado.
  - `parse.go`: HTML → `Preview` (x/net/html), puro e testado com páginas de
    exemplo em `testdata/`.
  - `youtube.go`: extrair id do YouTube, puro e testado.
  - `repository.go`: tabela `link_previews` (URL, campos, `image_path`,
    `failed`, `fetched_at`).
  - `service.go`: cache + deduplicação + busca + baixar imagem.
  - `handler.go` / `routes.go`: `GET /link-previews?url=`,
    `GET /link-previews/image/:id`.
  - `janitor.go`: limpa vencidos (linhas e arquivos).
- `cmd/wire_link_previews.go`: ligação (como os outros `wire_*.go`).
- `migrations/000199_create_link_previews.{up,down}.sql` e
  `migrations/000200_messages_embeds_suppressed.{up,down}.sql` (conferir
  números livres; a spec de arquivos usa um também).
- `internal/message/`: `EmbedsSuppressed bool` em `Message` (`model.go`),
  coluna no scan (`message_scan.go`, `messageColumns`). A rota nova
  `POST /channels/:channelId/messages/:messageId/suppress-embeds` (e a da
  conversa) vai num arquivo próprio `suppress_embeds.go` (handler + service
  method curto, só autor) porque `handler.go` já tem 490 linhas (regra 2:
  não crescer god file). Publica pelo mesmo caminho do evento de edição.
- Testes: `safeclient` (recusa 127.0.0.1, 10.x, 169.254.169.254, `[::1]`,
  redirecionamento para IP interno, porta 8080, corpo > 1 MB, não-HTML),
  `parse` (og completo, só `<title>`, relativo, `theme-color`, sem nada),
  `youtube`, `service` (cache acerta, falha guardada, duas chamadas
  simultâneas = uma busca), handler (sem login 401, URL inválida 400), suprimir
  (só autor, 403 para outro).

Frontend (`frontend/src/renderer/src/features/`):

- `linkpreview/` (nova feature):
  - `api/linkPreviews.ts`: busca a prévia.
  - `lib/previewLinks.ts`: escolhe até 3 links da mensagem (usa `linkify`;
    ignora convites, `<url>` e código), puro e testado.
  - `store/linkPreviewStore.ts` (store próprio, nunca no `chatStore`): cache
    em memória por URL + pedidos em andamento.
  - `components/LinkEmbed.tsx`: o cartão (faixa colorida, site, título link,
    descrição, imagem, X para o autor).
  - `components/YouTubeEmbed.tsx`: miniatura + play → iframe.
  - `components/RemoveEmbedsDialog.tsx`: confirmação.
  - `components/MessageEmbeds.tsx`: junta tudo para uma mensagem.
- `chat/components/MessageParts.tsx`: `MessageContent` renderiza
  `<MessageEmbeds>` depois dos anexos (uma linha).
- `chat/api/messages.ts`: `embeds_suppressed?: boolean`.
- `src/main/`: cabeçalho para o YouTube (decisão 9), no módulo de sessão/segurança
  que já existe, com teste.

## Textos aprovados

- X do cartão (rótulo): **"Remover prévias"**
- Confirmação: título **"Remover prévias?"**, texto **"As prévias de link desta
  mensagem somem para todo mundo."**, botões **"Remover"** e **"Cancelar"**
- Play do YouTube (rótulo): **"Reproduzir vídeo"**

## Visual e responsivo

- Cartão como no print: fundo de superfície, faixa de 4 px à esquerda na cor
  `theme-color` (sem ela, cor neutra do token), site em texto pequeno, título
  em `text-link` (abre fora, como os links de hoje), descrição em cor normal
  (máx. ~3 linhas), imagem grande com cantos arredondados. X (`CloseButton`)
  no canto superior direito, só para o autor, visível no hover/foco e sempre
  em toque.
- Cor do site: só aceita `#rgb`/`#rrggbb` (validado no backend), nunca CSS
  arbitrário.
- ≥ 768 px: `max-w` 432 px; imagem até 400 px de largura. 360 px: largura total
  da coluna, imagem escala por `aspect-ratio`.
- YouTube: proporção 16:9, largura até 400 px (100% em 360 px).
- Carregando: nada aparece (sem esqueleto), para não pular a linha à toa;
  falha: nada aparece.
- Teclado: título e play focáveis, `focus-ring`; diálogo com Esc e foco preso.

## Fora de escopo

- Mobile.
- Imagem direta como prévia (`https://.../foto.png`), GIFs de Tenor/Giphy por
  link, Twitter/X e outros embeds especiais, player de outros sites de vídeo.
- Remover uma prévia só (o X remove todas da mensagem, como no Discord).
- Preferência do usuário para desligar prévias.

## Verificação de ponta a ponta

1. `go test ./internal/linkpreview ./internal/message` verde (casos acima;
   os de banco com o Postgres local).
2. `npx vitest run src/renderer/src/features/linkpreview` e o teste do `src/main`
   verdes.
3. App local (backend + `yarn dev:web` e `yarn dev`):
   - mandar o link da Buser do print e comparar com o print;
   - mandar `http://127.0.0.1:8080`, `http://169.254.169.254/` e um link que
     redireciona para IP interno: nenhum cartão e o log do backend mostra a
     recusa;
   - mandar um YouTube, dar play **no app instalado (Electron) e na web**;
   - X como autor → confirmar → some no outro navegador logado sem recarregar;
   - outro usuário não vê o X;
   - 360, 768 e 1280 px.
4. `node scripts/affected-tests.mjs pr` verde.
