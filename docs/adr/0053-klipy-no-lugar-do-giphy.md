# 0053. KLIPY no lugar do GIPHY, chamada direto do app

- Status: aceito
- Data: 2026-11-03

## Contexto

O dono pediu para trocar o GIPHY pela KLIPY na aba de GIFs. O GIPHY passava
pelo nosso servidor (`internal/giphy`, ADR [0034](0034-gifs-favoritos.md)), com
cache de 5 minutos. As regras reais da KLIPY (lidas em 2026-11-03 em
docs.klipy.com/integration-requirements e /attribution) mudam isso:

- **Pedidos e mídia saem do aparelho de quem usa.** Rotear por servidor do
  parceiro, proxy ou CDN exige aprovação escrita da KLIPY
  (developers@klipy.com). Guardar, espelhar ou copiar a mídia também.
- **Não reordenar, filtrar nem misturar** os resultados com outro provedor; o
  filtro de conteúdo é o parâmetro `content_filter` (off/low/medium/high) e o
  Partner Panel, não um filtro nosso. URLs de mídia usadas como vêm.
- **Atribuição:** o placeholder da busca deve ser "Search KLIPY" (obrigatório);
  "Powered by KLIPY" e marca d'água no cartão são opcionais.
- Chave em modo *Testing*: 100 pedidos por hora; *Production* se pede no painel.
- `customer_id` é opcional (um identificador estável por usuário). `locale` é o
  país (ISO 3166 alfa-2), não o idioma.
- Anúncios têm API própria; não a usamos.

## Opções

1. **Manter o desenho do GIPHY** (o servidor chama a KLIPY e faz cache):
   contraria as regras sem a aprovação escrita, que ainda não existe.
2. **Os apps chamam a KLIPY direto**; o servidor só entrega a configuração
   (chave e `customer_id`) e guarda os favoritos.
3. **Ficar no GIPHY**: não era o pedido.

## Decisão

Opção 2, no pacote renomeado `internal/gifs` (o nome já não é de um provedor).

- `GET /api/gifs/config` (com login) devolve `{provider, app_key, customer_id,
  locale: "br", content_filter: "high", format_filter: "gif"}`. Sem
  `KLIPY_API_KEY` responde **503** `gifs_unavailable`, e o app mostra "GIFs
  indisponíveis" (também quando a KLIPY falha). A chave da KLIPY é de
  uso no cliente (vai no caminho da URL dela), então entregá-la a quem está
  logado é o desenho previsto.
- `customer_id` = HMAC-SHA256 do id do usuário, com a própria chave como
  segredo, 32 hex: estável por pessoa e sem expor o id real.
- Desktop, web e mobile fazem `fetch` direto em `api.klipy.com` (sem o token da
  Salinha) e convertem a resposta em `lib/klipy.ts`: URL no tamanho `md`,
  prévia no `sm`, só `.gif`, ordem e URLs como vieram. A CSP ganhou
  `connect-src https://api.klipy.com`; as imagens já cabem no `img-src https:`.
- **Rotas antigas** `/api/gifs/trending` e `/search`: continuam existindo para
  apps antigos, mas só buscam com `KLIPY_PROXY_SERVIDOR=1`, para ligar **depois**
  da aprovação escrita. Sem isso respondem 503 (os apps antigos mostram a aba
  sem GIFs até atualizar). Há cliente Go da KLIPY, sem cache, para esse caso.
  O log nunca leva a chave: o `*url.Error` do Go repete a URL (a chave está no
  caminho), então só a causa é registrada (o GIPHY vazava `api_key` assim).
- **Compatibilidade:** mensagens antigas com GIFs do GIPHY seguem aparecendo (a
  CSP e a validação de mídia aceitam `giphy.com` e `klipy.com`). Migration
  `000190`: `gif_favorites.provider` (`DEFAULT 'giphy'` cobre os favoritos
  existentes; down remove só a coluna). O provedor de um favorito vem do host da
  URL, não do que o cliente diz. O id de um GIF da KLIPY é o hash de 32 hex da
  URL (`/ii/<hash>/…`, igual em todos os tamanhos), então a estrela de um GIF do
  chat e a do seletor dão o mesmo id; sem o hash cai no slug.
- Textos: placeholder "Search KLIPY" (exigido) e rodapé "Powered by KLIPY".
- Sem anúncios. Sem o "share trigger" da KLIPY (opcional; guardaria o slug).

## Consequências

- O limite da KLIPY vale por chave, não por pessoa: em *Testing* (100/h) toda a
  Salinha divide isso. É preciso pedir *Production* antes de liberar.
- A chave aparece para quem está logado (inspecionando o app). Mitigação: ela
  só serve para a API de GIFs; o painel da KLIPY permite trocá-la.
- Como não há cache, cada busca vai à KLIPY (debounce de 250 ms no app).
- Desktop e web fazem o pedido do navegador/Electron: confirmar CORS com a
  chave real. Se a KLIPY recusar a origem, o caminho é a aprovação do proxy.
- A lógica de `lib/klipy.ts` existe no desktop e no mobile (cópia adaptada,
  como o resto da lógica pura) e a mesma conversão no Go do proxy legado.
- Quem hospeda o próprio servidor cria a chave em partner.klipy.com e a põe em
  `KLIPY_API_KEY` (docs/HOSPEDAGEM.md, docs/ai/servidor-proprio.md).
