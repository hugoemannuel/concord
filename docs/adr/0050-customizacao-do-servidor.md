# 0050. Customizar o servidor num domínio próprio, com a tag buscada à parte das mensagens

- Status: aceito
- Data: 2026-11-03

## Contexto

A issue #528 pede o perfil do servidor (banner, traços, descrição, jogos), o cartão que
aparece no convite e na tag, o perfil privado, a tag ao lado do nome em qualquer lugar,
a faixa e o tema de fundo. As forças: a tag aparece em muitas telas e respostas; o
perfil privado não pode vazar por nenhuma rota; trocar o nome da tag tira a tag de todo
mundo, e sair do servidor também; `internal/server` e `serverStore` são grandes e não
podem crescer; há outros PRs mexendo em mensagens, membros e cartão de perfil.

## Opções consideradas

1. **Tag dentro do objeto do usuário**, como o `primary_guild` do Discord: a tag já chega
   junto com cada mensagem e membro. Sem pedido a mais, mas obriga a mudar o SQL e o JSON
   de todas as rotas que devolvem pessoas (`cosmetics.Look`, mensagens, membros, DMs) e a
   invalidar tudo isso ao trocar o nome.
2. **Consulta em lote separada** (o padrão DataLoader, no cliente): cada linha pede a tag
   por id; os pedidos de um instante viram um `POST /server-tags/lookup`, com cópia local
   atualizada por evento. Um pedido a mais por tela, nenhuma rota antiga muda.
3. **Colunas em `servers`** e métodos em `server.Service`: menos arquivos, mas engorda um
   domínio que já está no limite e mistura aparência com regra de membros.

## Decisão

Opção 2, num domínio próprio (`internal/serverprofile`, `features/serverprofile`). A tag é
enfeite: pode chegar um instante depois do nome, e isolada assim não altera as rotas
quentes nem conflita com o que os outros PRs fazem nelas.

- **Tag da pessoa**: `user_server_tags` tem chave estrangeira composta para
  `server_members` com `ON DELETE CASCADE`. Sair, ser expulso, ser banido ou o servidor
  ser apagado tiram a tag em qualquer caminho, sem código nesses fluxos. Trocar o nome
  apaga as linhas do servidor na mesma transação da edição.
- **Edição parcial**: o `PUT` leva só o que mudou e roda com a linha travada (`FOR
  UPDATE`). Assim uma seção aberta há tempos não desfaz outra (nem tira a tag de todos ao
  reenviar um nome antigo).
- **Perfil privado**: o backend monta o cartão e devolve só `{server_id, locked}` para
  quem não é membro nem tem convite (pendente ou o código do link). Servidor que não
  existe responde igual, para não dar para sondar ids. Quem tem o link vê o perfil; a
  contagem de quem está fora fica guardada por 45 s, como na prévia do convite.
- **Tempo real**: `server:tag` vai para todo mundo e diz só qual servidor mudou, sem a
  tag (o servidor pode ser privado); quem tem a tag de alguém desse servidor pergunta de
  novo. `user:server_tag` leva a tag de quem a escolheu usar, que já é pública.
- **"Seus membros jogam"**: a atividade só existe na memória do hub. Uma amostra a cada
  5 min soma por servidor e por jogo, sem guardar quem jogou, sem invisíveis, e só quem
  tem `MANAGE_SERVER` lê, sem os totais.
- **Fundo do servidor**: reaproveita o gerador de tema (`features/appearance`) e a prévia
  do editor (`setThemePreview`), cedendo a vez ao editor e às Configurações. O membro
  desliga em Aparência (vale no aparelho).

## Consequências

- Mais fácil: novas telas mostram a tag com um componente só (`UserServerTag`).
- Mais difícil: um pedido a mais por tela, e eventos `server:tag`/`user:server_tag` vão
  para todas as conexões (como o `user:update`). Servidor apagado só some da cópia de
  quem está fora quando o prazo de 10 min dela vence.
- Depois: tag e cartão no app Android (`mobile/`); capas de jogos não existem (sem fonte
  própria, o quadro usa o ícone e a cor do catálogo).

## Fontes

- [DataLoader: juntar chaves numa consulta só](https://github.com/andrewdalpino/DataLoader-PHP)
- [`primary_guild` no objeto do usuário do Discord (referência da alternativa 1)](https://discord.js.org/docs/packages/discord-api-types/main/v10/APIUserPrimaryGuild:Interface)
- [Chaves estrangeiras e regras de cascata no PostgreSQL](https://dbschema.com/blog/postgresql/foreign-keys/)
