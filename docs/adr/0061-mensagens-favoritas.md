# 0061. Mensagens favoritas guardadas por referência, com o acesso conferido na leitura

- Status: aceito
- Data: 2026-11-09

## Contexto

A issue #590 pede favoritar uma mensagem (de canal ou de DM) para ver depois
numa lista pessoal, desfavoritar e pular até a mensagem original. Só a própria
pessoa vê a lista. Duas forças pesam: quem perdeu o acesso ao canal (saiu do
servidor, perdeu o cargo, saiu do grupo) não pode continuar lendo o conteúdo
pela lista, e a mensagem pode ser editada ou apagada depois de favoritada.

## Opções consideradas

1. **Cópia do conteúdo no favorito** (como o "Mensagens salvas" do Telegram,
   que encaminha para um chat consigo mesmo): a lista não depende da mensagem,
   mas mostra texto velho depois da edição, guarda o que o autor apagou e
   continua mostrando o conteúdo a quem perdeu o acesso.
2. **Favorito no aparelho (localStorage)**: simples, mas não vale em outro
   aparelho e não tem como conferir acesso.
3. **Referência no Postgres (`message_favorites`: pessoa, mensagem, quando),
   conteúdo lido da mensagem e acesso conferido a cada leitura**, como o
   "Salvar para depois" do Slack e os favoritos de GIF do repo
   ([0034](0034-gifs-favoritos.md)).

## Decisão

Opção 3, no domínio `internal/message` (arquivos `favorite*.go`: o favorito é
da mensagem e reusa as consultas dela). Rotas em
`/users/me/message-favorites` (`GET`, `GET /ids`, `PUT/DELETE /:messageId`);
limite de 500 por pessoa (409 acima). Favoritar exige ler a sala (sem acesso,
404, como mensagem inexistente). Na lista, o acesso é conferido uma vez por
sala com as mesmas regras do chat (`RoomAccess.CanRead`):

- **Perdeu o acesso**: o item volta como `unavailable`, só com o id e a data,
  sem conteúdo nem origem. Aparece como "Mensagem indisponível" e pode ser
  tirado; se o acesso voltar, o conteúdo volta.
- **Mensagem apagada**: some da lista (`ON DELETE CASCADE`). Não há o que
  abrir, e guardar um rastro dela seria guardar algo que o autor apagou.

No app, o store `messageFavoritesStore` (feature `messageFavorites`) guarda os
ids para o menu da mensagem dizer "Favoritar" ou "Remover das favoritas", e a
lista abre na tela "Favoritas" (link na barra do Início, rota `/favoritas`).
Abrir um item navega até o canal ou a DM e pula até a mensagem pelo mesmo
pedido de pulo da busca.

## Consequências

- O conteúdo é sempre o atual (edição aparece) e nada vaza para quem perdeu o
  acesso.
- A lista custa uma conferência de acesso por sala distinta (com o cache de
  permissões) e uma busca de reações e anexos para todos os itens juntos.
- Não há evento em tempo real: favoritar em um aparelho aparece no outro ao
  abrir a lista de novo (os ids recarregam ao trocar de conta ou recarregar).
- O app mobile ainda não tem a ação (a API já está pronta para ele).

## Fontes

- Slack, "Salvar para depois" (aba Depois): lista pessoal de referências às
  mensagens, que somem quando a mensagem é apagada.
- Telegram, "Mensagens salvas": cópia encaminhada para um chat próprio.
- [ADR 0034](0034-gifs-favoritos.md): favoritos por pessoa no backend.
