# Plano: envio de qualquer arquivo no chat

Spec: [2026-11-07-chat-arquivos-design.md](../specs/2026-11-07-chat-arquivos-design.md).
Branch `feat/chat-arquivos`. Mobile fora. Cada tarefa: teste primeiro (falhando
pelo motivo certo), código mínimo, `node scripts/affected-tests.mjs loop`.

## Baseline de CRAP (antes de mexer)

Funções que vou tocar já acima de 15: `conversation.Repository.ListByUserID`
(90, 0% sem banco: cobrir com o teste de banco), `useAttachmentDraft` IIFE do
upload (72, não tocar), `readMediaMeta` (12, sobe a 4 de complexidade: ganha
teste). `ServeFile` está em 14,1: extrair os cabeçalhos antes de mudar.
Nenhum god file (> 400 linhas) entre os tocados.

## Tarefas

1. **Estrutural (Go)**: extrair `fileHeaders(header, a)` do `ServeFile`
   (Content-Type, nosniff, CSP, cache, Content-Disposition). Testes atuais
   verdes, nada muda. Commit `refactor(chat): ...`.
2. **Migration 000198** `attachment_kind_file`: troca o CHECK de
   `message_attachments.kind` para incluir `'file'`; o down apaga as linhas
   `file` (comentado) e volta o CHECK antigo.
3. **media**: `KindFile` em `sniff.go` (comentário de segurança do `Sniff`
   atualizado); `SniffText(head)` em `text.go` com `text_test.go` (UTF-8,
   binário com `\x00`, runa cortada no fim, vazio).
4. **message**: `classify(head, declared)` (Sniff → mídia; senão `file` com
   `text/plain; charset=utf-8` ou `application/octet-stream`); `register` usa
   `classify` (sem 415). `fileHeaders` manda `attachment` para `file`.
   Testes: `.zip` → 201 `file` octet-stream; `.md` → `file` text/plain; SVG
   disfarçado → `file` (antes 415); `ServeFile` de `file` com `attachment`;
   imagem continua `inline`. CORS: `Range` em `AllowHeaders` (a prévia pede
   `bytes=0-16383` de outra origem no app desktop).
5. **conversation**: `WHEN MIN(a.kind) = 'file' THEN '📎 Arquivo'` no CASE da
   prévia; teste de banco (`TEST_DATABASE_URL`) com uma mensagem só com um
   anexo `file`.
6. **Front, regras puras** (`lib/attachments.ts`): `AttachmentKind` ganha
   `'file'`; `classifyFile(file, accept)`/`acceptFiles(count, files, accept)`
   com `accept: 'media' | 'any'` (o chat aceita tudo, os comentários de
   propostas continuam só mídia); `attachmentPreview` e prévia de fixada com
   `file` → ícone de anexo + "Arquivo"; `isTextFile`; `hasVisualPreview`.
7. **Front, rascunho**: `useAttachmentDraft(room, upload, accept)` (padrão
   `'media'`; `ChatPane` passa `'any'`); `readMediaMeta` devolve `{}` para
   `file` (com teste); `ComposerAttachments` mostra `FileIcon` para `file`;
   `ChatComposer` sem `accept` no seletor.
8. **Texto longo colado**: `lib/longPaste.ts` (`longPasteFile(text,
   draftCount)` e `pastedFiles(clipboard, draftCount)`) com testes;
   `useFileDropZone(addFiles, draftCount)` chama `pastedFiles` (uma linha).
   `ChatPane` passa `drafts.length` (ou `null` sem permissão de anexar).
9. **Ícones**: `FileIcon` e `DownloadIcon` em `shared/ui/icons`.
10. **Front, arquivo**: `lib/textFile.ts` (`fetchTextHead(url, bytes)`,
    `decodeText`, `previewLines`), `lib/downloadFile.ts` (fetch → blob →
    `<a download>`, o token nunca sai do app), com testes de função pura e
    deps injetadas.
11. **Componentes** em `components/attachments/`: `FileCard`,
    `TextFilePreview`, `TextFileViewer` (Modal `wide`, Copiar, Baixar,
    CloseButton) e `MessageAttachments` separando mídia, áudio e arquivo
    (`groupAttachments` em `lib/attachments.ts`). Testes com
    `renderToStaticMarkup`.
12. **Verificação**: `affected-tests pr`, CRAP depois, revisão de UI
    (web-design-guidelines) e revisão de código.

## Textos

Só os aprovados na spec: "Baixar {nome}", "Mostrar mais"/"Mostrar menos",
"Copiar", "Baixar", "Não foi possível carregar a prévia.", "Arquivo".
