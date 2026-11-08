# 0060. Ler as tags das páginas da prévia de links com `golang.org/x/net/html`

- Status: aceito
- Data: 2026-11-07

## Contexto

A prévia de links do chat ([spec](../superpowers/specs/2026-11-07-chat-previa-links-design.md))
precisa ler, no backend, o `<title>`, as `<meta property="og:*">`, a
`meta description` e o `theme-color` de páginas HTML de terceiros. É HTML do
mundo real: malformado, com atributos fora de ordem, entidades
(`&amp;`, `&#39;`), maiúsculas misturadas e `<meta>` dentro de `<body>`.
A regra 7 do AGENTS.md pede ADR para dependência nova no `go.mod`.

## Opções consideradas

1. **`golang.org/x/net/html` (tokenizador).** Mantido pelo time do Go, segue o
   algoritmo de parsing do HTML5, decodifica entidades e lida com HTML quebrado.
   Já está no `go.mod` como dependência **indireta** (v0.59.0); passa a ser
   direta, sem baixar nada novo. O tokenizador permite parar no `</head>` (ou
   no limite de 1 MB) sem montar a árvore inteira.
2. **Leitor de tags com regex/feito à mão.** Sem mudar o `go.mod`, mas frágil:
   ordem de atributos, aspas simples/duplas/sem aspas, entidades, comentários e
   `<script>` contendo `<meta` quebram regex. Mais código nosso para testar.
3. **`goquery` (seletores estilo jQuery).** Mais confortável, mas é dependência
   nova de fato (e puxa `cascadia`) só para ler meia dúzia de tags.

## Decisão

Opção 1. O uso fica restrito a `backend/internal/linkpreview/parse.go`, que
devolve um modelo próprio (`Preview`); trocar a biblioteca mexe só nesse
arquivo.

## Consequências

- `golang.org/x/net` sai do bloco `// indirect` do `go.mod`; versão continua a
  do módulo (atualizações seguem o resto das dependências).
- Nenhum binário ou tamanho extra relevante: o pacote já é compilado hoje por
  outras dependências.
