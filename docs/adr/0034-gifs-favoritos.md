# 0034. GIFs favoritos guardados no backend, por usuário, dentro de `internal/giphy`

- Status: aceito
- Data: 2026-10-30

## Contexto

A issue #460 pede favoritar um GIF e achá-lo de novo sem pesquisar (como a
aba "Favoritos" do Discord). O favorito é da pessoa e deve valer em qualquer
aparelho. O GIPHY não tem "conta" no nosso uso (só a chave do servidor), então
não há onde guardar isso do lado dele.

## Opções

1. **localStorage do app**: simples, mas não sincroniza entre aparelhos e some
   ao limpar os dados do navegador.
2. **Guardar só o id e buscar o GIF no GIPHY na hora de mostrar**: tabela
   menor, mas uma chamada a mais por favorito, depende da chave e do GIPHY
   estarem de pé, e o GIF removido no GIPHY some sem aviso.
3. **Tabela `gif_favorites` no Postgres com o necessário para mostrar e enviar
   o GIF** (id do GIPHY, título, URLs, tamanho), como já é com os sons
   favoritos da mesa de áudio ([0013](0013-mesa-de-audio-por-servidor.md)).

## Decisão

Opção 3, no pacote `internal/giphy` (mesmo assunto, ~150 linhas a mais; não
vale um domínio novo). Rotas `GET/PUT/DELETE /users/me/gif-favorites[/:gifId]`,
que respondem com a lista nova, do mais recente ao mais antigo; limite de 200
por pessoa (409 acima). Como o cliente é quem manda os dados do GIF, o backend
só aceita URLs `https` de `giphy.com` e subdomínios, e tamanhos plausíveis: o
favorito acaba sendo enviado no chat de outras pessoas. No cliente, o store
`gifFavoritesStore` faz a mudança na hora e desfaz se o servidor recusar. A
estrela fica sempre visível no seletor e, nos GIFs do chat, aparece no hover,
no foco e sempre no toque; o id vem da própria URL da mídia.

## Consequências

- Funciona em todos os aparelhos e não depende do GIPHY para listar.
- GIF enviado antes desta mudança só vira favorito se a URL tiver o formato
  `/media/<id>/…` do GIPHY (todos os enviados pelo seletor têm).
- O app mobile ainda não tem a estrela (a API já está pronta para ele).
