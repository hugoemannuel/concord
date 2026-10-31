<!-- PR de hotfix: hotfix/<slug> → main. Título: "hotfix: <o que quebrou, em uma frase>".
     Branch criada a partir de origin/main. Só correção urgente: nada de feature. -->

## O que muda

<!-- Uma ou duas frases: qual era a causa raiz e o que a correção faz. -->

## Como testar

- [ ] Teste de regressão que falhava antes da correção (nome do teste: <!-- cole aqui -->)
- [ ] `node scripts/affected-tests.mjs pr` verde (cole o resumo abaixo)
- [ ] `node scripts/check-migrations.mjs origin/main`

## Depois do merge

- [ ] PR de volta para a `develop` aberto (`hotfix/<slug>` → `develop`): <!-- #N -->
