# Formatação Markdown no chat: plano

Spec: [2026-11-07-chat-markdown-design.md](../specs/2026-11-07-chat-markdown-design.md).
Branch `feat/chat-markdown`, a partir de `origin/develop`.

## Ajuste à spec (estado atual da develop)

A spec foi escrita com o `ChatPane.tsx` em 644 linhas. Na develop atual (PR #581)
o campo já saiu para `components/ChatComposer.tsx` e o `ChatPane.tsx` tem 359
linhas (abaixo do limite de god file). A extração estrutural fica então:
campo (input + teclas + menção + colar) de `ChatComposer.tsx` para
`components/composer/ComposerInput.tsx`. No `ChatPane.tsx` só muda o tipo do
`inputRef` (textarea).

Sem DOM nos testes (o repo não tem jsdom/testing-library e dependência nova é
proibida): o comportamento interativo fica em funções puras testadas
(`composerKeyAction`, `isRevealKey`) e os componentes são testados por
`renderToStaticMarkup`.

## Baseline

`node scripts/crap.mjs --files` dos arquivos tocados: nenhuma função acima de 15
(maior: `MessageText` anônima 10,2; `ChatPane` `addFiles`/`handleDelete` 12).

## Tarefas

### Commit 1 — `docs: spec e plano da formatação Markdown no chat`

Spec + este plano.

### Commit 2 — estrutural (`refactor(chat): ...`), sem mudar comportamento

1. `components/markdown/RichTextParts.tsx`: o desenho de link/emoji/menção que
   está em `MessageText.tsx` (recebe `parts`, `mentionLabels`, `emojiSize`).
   `MessageText` passa a usá-lo. Testes existentes (`CustomEmoji.test.tsx`)
   continuam verdes; teste novo `RichTextParts.test.tsx` (link com `dir="ltr"`
   e `title` do host, chip de menção, texto puro).
2. `components/composer/ComposerInput.tsx`: o `<input>` do `ChatComposer`, com
   `keyHandlers` e o `handleKeyDown`. `ChatComposer` fica menor.

### Commit 3+ — comportamento (`feat(chat): ...`), TDD em cada passo

3. `lib/markdown/types.ts` + `parseInline.ts` (+ teste): negrito, itálico
   (`*`/`_` com borda de palavra), sublinhado, riscado, spoiler, código
   (1 ou mais crases), escape `\`, `<https://…>` (nó `autolink`), link cru
   consumido como texto (markdown dentro de URL não conta), aninhamento,
   marcador sem par literal. Cache de "não fecha a partir de" por delimitador
   (sem custo quadrático em texto hostil) e limite de profundidade.
4. `lib/markdown/parseBlocks.ts` (+ teste): bloco de código (com/sem `lang`,
   sem fechamento vira texto), `> `, `>>> `, `#`/`##`/`###` (não `####`),
   listas `-`/`*`/`1.` com um nível de aninhamento, `-# `, parágrafo.
5. `lib/markdown/stripMarkdown.ts` (+ teste): árvore → texto plano; spoiler vira
   `▮▮▮▮`.
6. `lib/markdown/stripCode.ts` (+ teste) e `mentionsUser` ignora código
   (teste em `mentions.test.ts`).
7. Backend: `internal/message/mention_code.go` (`StripCode`) + teste;
   `everyoneMentions` e `push.MentionedUsernames` usam o texto sem código
   (testes de regressão em `mention_test.go` e `push/mentions_test.go`).
8. Componentes `components/markdown/`: `MarkdownInline.tsx`,
   `MarkdownBlocks.tsx`, `CodeBlock.tsx` (+ `CopyIcon` em
   `shared/ui/icons/actions.tsx`), `Spoiler.tsx` (`isRevealKey` puro em
   `lib/markdown/spoiler.ts`). `MessageText` usa `parseBlocks` +
   `MarkdownBlocks` (memo + useMemo mantidos; jumbo só sem formatação).
   Testes por markup: `<pre>` + "Copiar código", spoiler com
   `role="button"`, `aria-label="Spoiler. Clique para revelar"`, `tabindex`.
9. Prévias de uma linha com `stripMarkdown`: `messagePreviewParts`
   (resposta, notificação, última mensagem da conversa), `pinnedPreview`,
   `replyPreview`, resultado de busca.
10. Campo de várias linhas: `composerKeyAction` ganha `send` (Enter sem Shift,
    fora de composição de IME; com toque como ponteiro principal, Enter quebra
    linha e o botão Enviar envia); Enter com menção destacada continua
    escolhendo; Enter com menu aberto sem destaque envia (era o submit nativo do
    `<input>`). `ComposerInput` vira `<textarea>` que cresce até 50% da altura
    e depois rola; refs e `onPaste` passam a `HTMLTextAreaElement`.

### Verificação

- `node scripts/affected-tests.mjs loop` a cada ciclo.
- `node scripts/crap.mjs` (≤ 15 em tudo tocado).
- `node scripts/affected-tests.mjs pr` verde.
- Conferência visual 360/768/1280 no app: depende de backend local; se não for
  possível, fica registrado no relatório.
