# Envio de qualquer arquivo no chat (estilo Discord): design

Spec 2 de 3 da ideia "colar texto formatado e mandar arquivos como no Discord".
Irmãs: [formatação](2026-11-07-chat-markdown-design.md) e
[prévia de links](2026-11-07-chat-previa-links-design.md). Independente das
outras duas.

## Objetivo

Mandar qualquer arquivo no chat (PDF, .zip, .md, código...) e ter a mesma
experiência do Discord: cartão com nome, tamanho e baixar; prévia do conteúdo
para arquivos de texto, com visualizador dentro do app; e texto longo colado
virando um anexo `message.txt`.

Hoje o servidor só aceita imagem, vídeo e áudio (`media.Sniff`, pelos bytes) e
recusa o resto com 415.

**Sucesso:** mandar um `.md` e um `.pdf` pelo desktop; o `.md` aparece com
prévia e abre inteiro no visualizador; o `.pdf` aparece como cartão e baixa;
colar 3000 caracteres vira `message.txt`.

## Decisões (com o porquê)

1. **Abordagem A (escolhida pelo usuário): tipo novo `file`, texto detectado
   pelo servidor.** O que o `Sniff` não reconhece vira `kind: "file"`. Se os
   primeiros bytes forem UTF-8 válido e sem byte nulo, `content_type =
   "text/plain; charset=utf-8"`; senão `"application/octet-stream"`. Quem decide
   o que é texto são os bytes, não a extensão (binário renomeado para `.txt` não
   ganha prévia de lixo). Alternativas descartadas: prévia por extensão no
   cliente (frágil, lista duplicada entre apps) e prévia guardada no banco
   (migration e listagens mais pesadas; o Range já resolve).
2. **Todo tipo é aceito, inclusive `.exe`**, como no Discord, sem aviso
   especial. Limites atuais mantidos: 25 MB por arquivo, 10 por mensagem.
   *Decisão do agente, apresentada ao usuário sem objeção.*
3. **Arquivo `file` é sempre servido para baixar**: `Content-Disposition:
   attachment` (mais `nosniff` e o `CSP sandbox` que já existem). O navegador
   nunca abre um HTML/SVG/PDF enviado na origem do app (ver aviso em
   `media/sniff.go`). Imagem, vídeo e áudio continuam `inline`.
4. **Prévia de texto no desktop/web** lê só o começo do arquivo por Range e
   mostra o **texto cru** (o `.md` não é formatado), como no Discord.
5. **Visualizador dentro do app**: clicar na prévia abre o arquivo numa janela
   da Salinha, texto cru, com copiar e baixar. Carrega até 1 MB; acima disso
   mostra o primeiro 1 MB seguido de uma linha "…" (sem texto novo) e o botão
   Baixar dá o resto. *Limite decidido pelo agente.*
6. **Colar texto com mais de 2000 caracteres** (o limite da mensagem) cria um
   anexo `message.txt` no rascunho em vez de colar, como no Discord. Conta só o
   texto colado; abaixo disso cola normal. Sem aviso: o anexo aparece na lista.
   Se o rascunho já tem 10 anexos, cola normal (truncado pelo limite do campo).
7. **Celular fora desta entrega** (pedido do usuário: "ignora o mobile agora").
   Consequência aceita: o app do celular hoje esconde anexo de tipo
   desconhecido, então quem está no celular não vê os arquivos (a mensagem
   aparece, o anexo não) até uma entrega futura do mobile.
8. **Rótulo na lista de conversas** com um arquivo: "Arquivo". Vários anexos
   mantêm o rótulo que já existe ("N anexos"), em vez de "N arquivos", para não
   mudar o que já está no ar. *Ajuste do agente ao texto aprovado.*

## Arquitetura (arquivos e pastas)

Backend (`backend/`):

- `migrations/000198_attachment_kind_file.{up,down}.sql`: troca o `CHECK` de
  `message_attachments.kind` para incluir `'file'`. O down apaga as linhas
  `file` e recoloca o CHECK antigo (comentário no arquivo avisando que o down
  perde esses anexos). Conferir o número livre na hora.
- `internal/platform/media/sniff.go`: `KindFile`. Nova função
  `SniffText(head []byte) bool` em `media/text.go` (UTF-8 válido ignorando uma
  runa cortada no fim dos 512 bytes, sem `\x00`). Atualizar o comentário de
  segurança do `Sniff` explicando que o desconhecido vira `file` e só é servido
  como `attachment`.
- `internal/message/attachment_handler.go` (314 linhas): no upload, onde hoje
  responde 415 para tipo desconhecido, classificar como `file`. No `ServeFile`,
  `attachment` para `kind == file`. Pequena função pura
  `classify(head, declared) (kind, contentType)` testável.
- `internal/conversation/repository.go`: o `CASE` da prévia da última mensagem
  ganha `WHEN MIN(a.kind) = 'file' THEN '📎 Arquivo'` (segue o padrão já
  existente nesse SQL) e o `ELSE` continua áudio.
- Testes: `sniff`/`text` (UTF-8, binário, runa cortada), handler (upload de
  `.zip` → 201 `file` octet-stream; `.md` → `file` text/plain; `ServeFile` de
  `file` com `attachment`; imagem continua `inline`).

Frontend (`frontend/src/renderer/src/features/chat/`):

- `api/messages.ts`: `AttachmentKind` ganha `'file'`.
- `lib/attachments.ts` (244 linhas): sem filtro de tipo na seleção
  (`ACCEPT_ATTRIBUTE` sai ou vira vazio); `attachmentPreview` com `case 'file'`
  → ícone de anexo + "Arquivo"; `isTextFile(a)` (`baseMime === 'text/plain'`).
- `lib/longPaste.ts` (novo, puro e testado): `longPasteFile(text, draftCount)`
  → `File | null` (`message.txt`, `text/plain`).
- `hooks/useFileDropZone.ts`: `onPaste` usa `longPasteFile` antes do fluxo de
  colar arquivo.
- `components/attachments/` (nova pasta para não inchar `MessageAttachments.tsx`):
  - `FileCard.tsx`: ícone (SVG de `shared/ui/icons`; criar `FileIcon` se não
    existir), nome (truncado com reticências no meio não é preciso: truncar no
    fim), tamanho (`formatBytes`), `IconButton` baixar.
  - `TextFilePreview.tsx`: pede `bytes=0-16383` com o token de mídia, mostra
    ~20 linhas em `<pre>`, "Mostrar mais"/"Mostrar menos" (expande até o que
    foi baixado), clique abre o visualizador.
  - `TextFileViewer.tsx`: janela (usar o modal de `shared/ui`), título = nome
    do arquivo, `<pre>` com rolagem, botões "Copiar", "Baixar" e
    `CloseButton`; Esc fecha.
  - `lib/textFile.ts`: buscar com Range e decodificar (`TextDecoder`, sem
    falhar em runa cortada), testado.
- `components/MessageAttachments.tsx`: separa imagens/vídeos, áudios e
  arquivos; `file` vai para `TextFilePreview` (texto) ou `FileCard`. Hoje
  qualquer não-áudio cai como "visual"; corrigir isso.
- **Baixar** (web e app, mesmo caminho): `lib/downloadFile.ts` busca o
  arquivo com `fetch` (token de mídia), cria um `blob:` e clica num `<a
  download={filename}>` temporário. `<a download>` direto para a URL da API não
  serve: em outra origem o `download` é ignorado, vira navegação, o
  `navigationGuard` manda a URL **com o `?token=`** para o navegador de fora.
  Com o blob o token nunca sai do app. 25 MB em memória é aceitável.
  *Decisão do agente.*

Mobile: nada (fora desta entrega).

## Textos aprovados

- Botão do cartão: **"Baixar {nome}"** (rótulo do `IconButton`/acessibilidade)
- Prévia: **"Mostrar mais"** / **"Mostrar menos"**
- Visualizador: título = nome do arquivo; botões **"Copiar"**, **"Baixar"** e
  fechar (`CloseButton`)
- Falha na prévia: **"Não foi possível carregar a prévia."**
- Lista de conversas, um arquivo: **"Arquivo"** (vários: "N anexos", já existente)
- Texto longo colado: nenhum aviso.

## Visual e responsivo

- Tokens, ícones de `shared/ui/icons`, `Button`/`IconButton`/`CloseButton`,
  `focus-ring`.
- Cartão e prévia: largura total até 432 px (≥ 768 px: `max-w` 432 px; em
  360 px ocupam a coluna toda); nome longo trunca; tamanho em cor apagada.
- Prévia de texto: `font-mono`, rola na horizontal por dentro.
- Visualizador: < 768 px tela cheia; ≥ 768 px janela central até 900 px de
  largura e 80% da altura, conteúdo rola.
- Teclado: cartão/prévia focáveis, Enter abre o visualizador, Esc fecha, foco
  volta para a prévia. Toque: alvos ≥ 44 px.

## Fora de escopo

- Qualquer mudança no app do celular (mostrar ou enviar arquivos).
- Prévia de PDF, Office, zip (lista de conteúdo).
- Filtro `has:file` na busca.
- Anexos genéricos nos comentários de propostas.
- Antivírus/varredura de arquivos.

## Verificação de ponta a ponta

1. `go test ./internal/platform/media ./internal/message ./internal/conversation`
   verde (testes citados acima; os de banco com o Postgres do
   `scripts/server-up.sh`).
2. `npx vitest run` dos novos `lib/longPaste`, `lib/textFile`, `attachments`,
   e dos componentes `FileCard`, `TextFilePreview`, `TextFileViewer`,
   `MessageAttachments`.
3. App local (backend + `yarn dev:web` e `yarn dev`): mandar `.md`, `.pdf`,
   `.zip` e um binário renomeado `.txt` (vira cartão, sem prévia); abrir o
   visualizador; baixar nos dois; colar 3000 caracteres → `message.txt`; abrir
   `/api/media/<id>` direto no navegador de um `.html` enviado e confirmar que
   baixa, não abre; conferir 360/768/1280 px.
4. `node scripts/affected-tests.mjs pr` verde.
