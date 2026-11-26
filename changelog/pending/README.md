# Notas das próximas versões

Cada PR de feature ou correção visível ao usuário **cria um arquivo novo** aqui,
`AAAA-MM-DD-assunto.md`, com as notas em linguagem de usuário (uma frase cada):

```md
## Novidades

- Chat: texto da novidade.

## Correções

- Chamadas: texto da correção.
```

- O deploy envia todos os arquivos desta pasta (`scripts/publish-changelog.mjs`).
  O servidor guarda numa versão só as notas **de arquivos que nenhuma versão
  anterior trouxe**: a identidade da nota é o arquivo, não o texto.
- Por isso, **não edite um arquivo já publicado** para acrescentar nota (ela não
  sairia em versão nenhuma): crie outro arquivo. Corrigir um erro de digitação
  numa nota publicada é seguro, o texto antigo continua no histórico.
- Um arquivo por PR também evita conflito de merge entre PRs.
- O `node scripts/publish-changelog.mjs --check changelog/pending` valida os
  limites (o `affected-tests pr` roda quando o diff toca a pasta).
- Este `README.md` não vira nota.

## Versão obrigatória e destaque nas novidades

Um cabeçalho opcional no topo do arquivo ([ADR 0066](../../docs/adr/0066-atualizacao-obrigatoria-e-novidades.md)):

```md
---
obrigatoria: true
destaque: true
---
## Novidades

- Chat: texto da novidade.
```

- `obrigatoria: true`: a versão que levar este arquivo vira a **versão mínima**. Quem estiver
  no desktop numa versão anterior fica bloqueado até atualizar (a janelinha de abertura também
  perde o "Abrir sem atualizar"). Precisa de ao menos uma nota: é ela que explica por que
  atualizar. Use só quando a versão antiga deixar de funcionar com o servidor novo.
- `destaque: true`: as notas deste arquivo aparecem, uma vez, no modal de novidades de quem
  atualizar (desktop e web). Sem destaque, a nota fica só na página de Novidades.
- Só valem `obrigatoria` e `destaque`, com `true` ou `false`; o `--check` recusa o resto.
