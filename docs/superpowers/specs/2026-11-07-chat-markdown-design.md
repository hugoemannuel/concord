# Formatação Markdown no chat (estilo Discord): design

Spec 1 de 3 da ideia "colar texto formatado e mandar arquivos como no Discord".
Irmãs: [arquivos](2026-11-07-chat-arquivos-design.md) e
[prévia de links](2026-11-07-chat-previa-links-design.md). As três são
desenvolvidas em paralelo (cada uma na sua branch), mas **entram na `develop`
nesta ordem: formatação → arquivos → links**. A spec 2 mexe no mesmo colar
(`onPaste`) e a spec 3 usa o leitor desta para ignorar links em código; cada uma
faz rebase sobre a anterior antes do PR. *Ordem combinada com o usuário;
sequência de merge decidida pelo agente.*

## Objetivo

Quem cola um texto escrito no Discord (negrito, blocos de código, citações...)
vê a mensagem na Salinha com o mesmo formato. Hoje o campo do desktop é um
`<input>` de uma linha (as quebras de linha somem ao colar) e a mensagem só
reconhece links, menções e emojis personalizados.

**Sucesso:** colar uma mensagem do Discord com bloco de código, citação, lista e
negrito no campo do desktop/web, enviar, e ver tudo formatado como no Discord.

## Decisões (com o porquê)

1. **Só desktop e web nesta entrega.** O app do celular continua mostrando o
   texto cru; formatação no mobile vem depois (pedido do usuário).
2. **O texto é guardado cru; quem formata é a tela.** O backend não muda.
   Mensagens antigas que tiverem `**` passam a aparecer formatadas, como no
   Discord.
3. **Leitor próprio, sem dependência** (abordagem A, escolhida pelo usuário).
   Alternativas descartadas:
   - `simple-markdown` + regras do Discord: dependência nova (ADR), parada desde
     2022, difícil de encaixar menções/emojis.
   - `marked`/`markdown-it` + `DOMPurify`: é CommonMark, não Discord (`__` vira
     negrito, tabelas/imagens entram), exige HTML cru sanitizado e quebra a
     integração com as menções.
   Fica no padrão do repo (lógica pura em `features/chat/lib`, desenho com
   elementos React), então **não há ADR**.
4. **Sem cores de sintaxe** nos blocos de código (usuário escolheu): fonte
   monoespaçada, fundo, botão de copiar. A linguagem após as crases é aceita e
   ignorada no desenho.
5. **Sem HTML cru**: nada de `dangerouslySetInnerHTML`. A árvore vira elementos
   React; isso fecha a porta para injeção de script.
6. **Campo de várias linhas**: Enter envia, Shift+Enter pula linha (como no
   Discord). Enter com a lista de menções aberta e item escolhido continua
   escolhendo a menção (comportamento atual).
7. **Prévias de uma linha tiram os símbolos** (resposta, notificação, barra de
   fixada, resultado de busca, lista de conversas): fica só o texto, como no
   Discord. *Decisão do agente.* O conteúdo de spoiler **não** aparece nelas:
   vira `▮▮▮▮` ("a resposta é ▮▮▮▮"). *Proposta do agente; o usuário pode
   trocar por "spoiler" na revisão.*
8. **Links mascarados `[texto](url)` ficam de fora** (usados para golpe) e
   tabelas também (o Discord não tem). Aparecem como texto.
9. **Comentários de propostas ganham a formatação junto**, porque usam o mesmo
   `MessageText`. *Consequência aceita.*
10. **Menção dentro de código não pinga** (como no Discord): o texto de código
   (inline e bloco) é ignorado ao procurar menções, no backend
   (`internal/message/mention.go`) e no app (`mentionsUser` em
   `features/notifications/lib/notifications.ts`). Um corte puro
   `stripCode(content)` em Go e o equivalente em TS, testados.

## Sintaxe suportada (regras do Discord)

Blocos (começo de linha):

| Sintaxe | Resultado |
|---|---|
| ` ```lang\n...\n``` ` | bloco de código (conteúdo literal, nada dentro é formatado; `lang` opcional e ignorado). Sem fechamento: o resto da mensagem é texto normal, não bloco |
| `> texto` | citação de uma linha |
| `>>> texto` | citação do ponto até o fim da mensagem |
| `# `, `## `, `### ` | títulos (só com espaço depois; `####` é texto) |
| `- ` / `* ` / `1. ` | listas (não ordenada / ordenada; recuo de 2+ espaços aninha um nível) |
| `-# texto` | texto pequeno e apagado (subtexto) |

Trechos (dentro de qualquer bloco, exceto código):

| Sintaxe | Resultado |
|---|---|
| `**x**` | negrito |
| `*x*` / `_x_` | itálico (`_` só vale com borda de palavra: `snake_case_nome` não vira itálico) |
| `__x__` | sublinhado |
| `~~x~~` | riscado |
| `` `x` `` / ``` ``x`` ``` | código no meio da frase (literal) |
| `\|\|x\|\|` | spoiler |
| `\*` | escape: o caractere sai literal |
| `<https://...>` | link sem os `<>` na tela e **sem prévia** (spec 3), como no Discord |

Combinações aninham (`***x***` = negrito+itálico, `__**x**__`, spoiler com
negrito dentro). Marcador sem par sai literal. Links, menções e emojis
personalizados continuam funcionando dentro de qualquer trecho (menos dentro de
código, que é literal). Emoji-only jumbo continua valendo só para mensagem sem
formatação.

## Arquitetura (arquivos e pastas)

Frontend, `frontend/src/renderer/src/features/chat/`:

- `lib/markdown/` (nova)
  - `parseBlocks.ts`: texto → blocos (`code`, `quote`, `heading`, `list`,
    `subtext`, `paragraph`).
  - `parseInline.ts`: texto de um bloco → trechos (`bold`, `italic`,
    `underline`, `strike`, `code`, `spoiler`, `text`).
  - `types.ts`: a árvore (`MdBlock`, `MdInline`).
  - `stripMarkdown.ts`: árvore → texto plano para as prévias de uma linha.
  - testes `*.test.ts` de cada um (tabela de casos, incluindo os de borda acima).
- `components/markdown/` (nova)
  - `MarkdownBlocks.tsx`: desenha os blocos.
  - `MarkdownInline.tsx`: desenha os trechos; folhas de texto passam por
    `messageParts` (links → emojis → menções) e reaproveitam o desenho atual de
    link/chip/emoji (extrair de `MessageText.tsx` para um componente
    `RichTextParts` usado pelos dois).
  - `CodeBlock.tsx`: `<pre>` com rolagem horizontal + `IconButton` "Copiar
    código" (usa `shared/lib/clipboard`).
  - `Spoiler.tsx`: botão acessível que revela.
- `components/MessageText.tsx`: passa a usar `parseBlocks` + `MarkdownBlocks`.
  Mantém o `memo` e o `useMemo` da análise.
- **Campo de várias linhas**: `ChatPane.tsx` tem 644 linhas (god file, regra 2).
  O campo (input + teclas + menção + colar) sai para
  `components/composer/ComposerInput.tsx` (textarea que cresce até ~50% da
  altura e depois rola) com a lógica de teclas pura em `lib/composerKeys.ts`
  (testada). `ChatPane.tsx` sai do PR menor do que entrou. Fazer a extração
  num commit estrutural separado, antes da troca para textarea.
- `useFileDropZone.onPaste` passa a tipar `HTMLTextAreaElement`.
- Prévias de uma linha: os pontos que hoje mostram `content` cru (barra de
  fixada em `chatPaneView.ts`, `replyPreview` em `MessageParts.tsx`,
  notificações em `features/notifications/lib/notifications.ts`, busca,
  lista de conversas no app) passam por `stripMarkdown`. O builder localiza
  todos com busca por `.content` nesses módulos.

Backend: só o `stripCode` antes de extrair menções (decisão 10), em
`internal/message/mention_code.go` com teste. Mobile: nada.

## Textos aprovados

- Spoiler fechado (rótulo para leitor de tela): **"Spoiler. Clique para revelar"**
- Botão do bloco de código: **"Copiar código"**; depois de copiar, **"Copiado"**
  por 2 s.

## Visual e responsivo

- Tokens do `assets/main.css` apenas (cor, texto, raio); ícones de
  `shared/ui/icons`; botões `IconButton`; `focus-ring` em spoiler e copiar.
- Bloco de código: fundo de superfície, borda sutil, `font-mono`, rola na
  horizontal (`overflow-x-auto`), nunca alarga a linha da mensagem. Copiar
  aparece no hover/foco no desktop e fica sempre visível em toque
  (`pointer: coarse`).
- Citação: barra vertical à esquerda (4 px, cor apagada), como no Discord.
- Títulos: três tamanhos a partir dos tokens de texto; subtexto em tamanho
  pequeno e cor apagada.
- Spoiler: fundo escuro cobrindo o texto; clique/Enter/Espaço revela (e fica
  revelado). Revelado não é clicável de novo.
- 360 px: nada transborda na horizontal (só o `<pre>` rola por dentro).
  768/1280 px: mesmo desenho, largura limitada pela coluna do chat.
- Textarea: tecla e toque; Shift+Enter no teclado físico; no toque o botão
  Enviar continua sendo o caminho principal.

## Fora de escopo

- Formatação no app do celular.
- Cores de sintaxe.
- Links mascarados, tabelas, imagens em Markdown, timestamps `<t:...>`.
- Barra de formatação ao selecionar texto (botões de negrito etc.).
- Prévia do formato enquanto digita.

## Verificação de ponta a ponta

1. `npx vitest run src/renderer/src/features/chat/lib/markdown` verde, com
   casos de: cada sintaxe, aninhamento, marcador sem par, bloco sem fechamento,
   `snake_case`, escape, link e menção dentro de negrito, menção dentro de
   código (fica literal).
2. Testes de componente: `MessageText` com bloco de código mostra `<pre>` e o
   botão copia; spoiler revela por clique e por teclado; `ComposerInput`:
   Enter envia, Shift+Enter quebra linha, Enter com menção destacada escolhe.
3. App (`yarn dev:web`): colar no campo o texto de exemplo abaixo, enviar e
   conferir o formato; conferir em 360, 768 e 1280 px; conferir que a lista de
   conversas e a notificação mostram texto sem `**`.

   ````
   # Título
   **negrito** *itálico* __sub__ ~~risco~~ ||spoiler|| `code` @alguem
   > citação
   - item 1
     - item 2
   ```js
   const x = 1
   ```
   -# rodapé
   ````
4. `node scripts/affected-tests.mjs pr` verde (CRAP ≤ 15 nas funções do leitor:
   quebrar por regra se precisar).
