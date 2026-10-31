<!-- PR de release: develop → main. Título: "release: <destaques, separados por vírgula>".
     Merge na main publica atualização para todos os apps instalados. -->

## O que muda

<!-- Um item por PR que entra, com o link e, se houver, "closes #N". Exemplo:
- Sons de notificação personalizados ([feat(sons): sons de notificação personalizados por pessoa #467](link)) — closes #461
-->

## Como testar

- [ ] `node scripts/affected-tests.mjs full` verde na develop (diga o que rodou: backend, frontend, mobile)
- [ ] `node scripts/check-migrations.mjs origin/main`
