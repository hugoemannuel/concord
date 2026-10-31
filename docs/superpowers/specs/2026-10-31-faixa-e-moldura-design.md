# Faixa e moldura no perfil — design

Issue: [#482](https://github.com/hugoemannuel/concord/issues/482) (proposta da comunidade,
9 sim × 1 não). Data: 31/10/2026.

## Intenção

A comunidade pediu as duas personalizações do Discord que faltam no Salinha:

- **Faixa** (a "placa de identificação" do Discord): uma imagem atrás do nome, na linha
  da pessoa nas listas.
- **Moldura** (a "decoração de avatar"): uma imagem transparente desenhada em volta e
  por cima do avatar.

No Discord as duas vêm de uma loja. Aqui **a própria pessoa envia a imagem ou o GIF**,
como já faz com avatar e banner. **Performance é requisito**: a lista de membros de um
servidor cheio não pode ficar pesada.

## Objetivos

1. A faixa é **opcional**: só aparece para quem ativa no perfil. Quem ativa escolhe
   entre **usar o banner** (inclusive banner GIF) ou **enviar uma imagem própria**.
2. A moldura é opcional: só aparece para quem envia uma imagem.
3. Nas listas, faixa e moldura aparecem **paradas** (o primeiro quadro). O GIF só anima
   no hover ou no foco da linha, como o avatar já faz.
4. Configurações › Perfil tem uma **prévia lado a lado, "Parada" e "Animando"**, com a
   linha de membro do jeito que os outros vão ver (faixa + moldura). Sem GIF, aparece
   só a "Parada".
5. A mudança chega ao vivo para quem está online (`user:update`), como o avatar.

## Fora do escopo

- App mobile (`mobile/`): ignora os campos novos (JSON a mais não quebra nada). Fica
  para uma fatia futura.
- Catálogo de faixas e molduras prontas.
- Perfis salvos (`savedprofile` / `ProfileSnapshot`): faixa e moldura não entram no
  snapshot nesta versão.
- Faixa no cartão de perfil (o cartão já tem banner) e no chat (a mensagem não tem
  "linha"). A moldura aparece em todo lugar que usa o `Avatar` e recebe os dados.

## O que conta como fracasso, mesmo funcionando

- Abrir um servidor com centenas de membros baixa os GIFs de todos.
- O nome fica ilegível em cima de uma faixa clara.
- Quem nunca mexeu nisso vê a própria linha mudar no dia do deploy.

## Abordagens consideradas

| | Abordagem | Troca |
|---|---|---|
| **A (escolhida)** | Colunas em `users` e campos enviados junto com os membros, mensagens e DMs, no mesmo caminho do `name_style` | Mexe nas consultas de membros (e em god files, que precisam encolher), mas chega de uma vez, sem requisição a mais |
| B | Guardar no JSON do `profile_theme` | O tema só chega pelo cartão: daria o mesmo trabalho de consultas e misturaria URLs com a validação de cores e IDs |
| C | Endpoint separado, buscado em lote pelas listas | Não mexe nas consultas, mas acrescenta uma requisição e a lista "pisca" quando a faixa chega |

O usuário escolheu A.

## Desenho

### Banco (migration `000183_faixa_moldura`)

```sql
ALTER TABLE users
  ADD COLUMN nameplate_mode TEXT NOT NULL DEFAULT 'off'
    CHECK (nameplate_mode IN ('off', 'banner', 'custom')),
  ADD COLUMN nameplate_url TEXT,
  ADD COLUMN avatar_decoration_url TEXT;
```

Com o default `off`, ninguém ganha faixa sem pedir.

### Backend (`internal/user`, mais um pacote pequeno `internal/cosmetics`)

- **`internal/cosmetics`** (novo, no molde de `namestyle`): os modos válidos
  (`off`/`banner`/`custom`), `Validate` e
  `NameplateExpr(alias)`/`DecorationExpr(alias)`, as expressões SQL usadas por quem
  lista usuários. A **URL efetiva** da faixa é resolvida no SQL:
  `CASE mode WHEN 'banner' THEN banner_url WHEN 'custom' THEN nameplate_url END`.
  O cliente nunca precisa saber o modo dos outros, e trocar o banner atualiza a faixa
  sozinho.
- **JSON público** (`User`, `PublicProfile`, membros, conversas, mensagens):
  `nameplate_url` (efetiva, pode faltar) e `avatar_decoration_url` (pode faltar),
  ambos `omitempty`.
- **JSON da própria pessoa** (`SelfUser`): também `nameplate_mode` e
  `nameplate_custom_url` (a imagem própria guardada, mesmo com o modo em `banner`, para
  o editor mostrar).
- **Rotas** (em `ProfileRoutes`, reaproveitando `upload`/`remove` e `UploadImage`, com
  o quadro parado e o loop do GIF):
  - `POST/DELETE /users/me/nameplate`: grava ou apaga `nameplate_url`. Enviar uma imagem
    põe o modo em `custom`. Apagar com o modo em `custom` volta para `off`.
  - `POST/DELETE /users/me/decoration`.
  - `PUT /users/me/nameplate-mode` `{ "mode": "off|banner|custom" }`: rota própria para
    não mexer no `PUT /users/me/profile` (que manda o perfil inteiro). `custom` sem
    imagem guardada → 400. `banner` sem banner é aceito: a faixa só fica vazia até
    existir um banner.
- Toda mudança emite `user:update`, como avatar e banner já fazem.
- `removeMedia` e o `MediaKeeper` continuam valendo: a URL antiga é apagada do disco na
  troca.

### Consultas que passam a trazer os campos

Os mesmos lugares onde hoje entra `namestyle.Expr`:

- `server/repository.go`: membros do servidor. **Tem 639 linhas.** No mesmo PR, extrair
  as consultas de membros para `server/member_repository.go`, num commit estrutural
  separado, antes da mudança.
- `conversation/repository.go`: DMs e membros do grupo. **Tem 451 linhas.** Extrair a
  parte de participantes do mesmo jeito.
- `message/repository.go`: autor da mensagem, só a `avatar_decoration_url` (a moldura
  aparece no chat).
- `level/ranking_repository.go`: fica de fora (não usa linha de membro).

### Frontend

- **Tipos**: `nameplate_url?` e `avatar_decoration_url?` nos tipos de membro, conversa,
  mensagem, `PublicProfile` e `SelfUser`. `useUserLook` passa a devolver os dois campos,
  com o `profileStore` (`user:update`) ganhando do fallback, como o avatar.
- **Moldura no `shared/ui/Avatar`**: prop/look `decorationUrl`. Desenha uma `<img>` com
  `pointer-events-none`, `position:absolute`, **1,2× o lado do avatar**, centralizada
  por cima (como no Discord), sem mudar o tamanho do layout do avatar. Usa a mesma
  regra `animate` (`always`/`hover`/`never`) do avatar.
- **Faixa: componente novo `features/profile/components/Nameplate.tsx`**, posto atrás
  do conteúdo da linha (`absolute inset-0`, `object-cover`, cantos arredondados da
  linha). Um degradê da cor de fundo da lista para transparente, da esquerda para a
  direita, garante a leitura do nome. Usado em `MemberRow` (servidor),
  `GroupMemberRow` e `ConversationRow`.
- **Regras de performance** (faixa e moldura):
  1. A lista carrega **só o `/static`** (o quadro parado), com `loading="lazy"` e
     `decoding="async"`.
  2. O GIF **só é montado no DOM enquanto a linha está em hover ou foco** (estado
     React, não `visibility`): uma `<img>` invisível com `loading="lazy"` ainda baixa
     quando está na tela, e a lista inteira está na tela. Ao sair do hover, a `<img>`
     animada é desmontada.
  3. Sem `filter`/`backdrop-filter`/`blur` em cima da faixa. O degradê é um
     `linear-gradient` simples.
  4. Sem faixa ou sem moldura, nada é renderizado (nenhum nó extra).
- **Editor** (Configurações › Perfil, nova `TileSection` **"Faixa e moldura"** ao lado
  de "Avatar e banner"):
  - Abre um modal próprio (como os outros tiles), que aplica na hora, fora do
    `saveProfile`.
  - Faixa: escolha entre *Desligada* / *Usar o banner* / *Imagem própria*. "Imagem
    própria" abre o arquivo e o recorte.
  - Moldura: tile para enviar, mais "Remover".
  - Prévia: duas linhas de membro lado a lado, "Parada" (força o `/static`) e
    "Animando" (força o GIF). Sem GIF em nenhuma das duas, só a "Parada". Antes de
    salvar, a prévia usa o arquivo local recortado.
  - Responsivo: em telas estreitas (< 480 px), as duas prévias ficam uma embaixo da
    outra.
- **Recorte** (`ImageCropModal`, `ImageKind` ganha `nameplate` e `decoration`):
  - faixa: proporção **6:1**, saída **600×100**;
  - moldura: quadrada, saída **240×240**, **mantendo a transparência** (o recorte
    parado já sai em WebP, que tem alfa; o recorte de GIF precisa preservar o índice
    transparente, e isso precisa de teste).

### Textos de UI (precisam de aprovação humana antes do commit)

"Faixa e moldura", "Faixa", "Moldura", "Desligada", "Usar o banner", "Imagem própria",
"Alterar moldura", "Remover moldura", "Remover faixa", "Parada", "Animando".

## Testes (TDD)

- Go: `cosmetics.Validate`; o SQL efetivo da faixa (off/banner sem banner/banner/custom)
  em teste de banco; as rotas de upload e delete (o delete de `custom` volta para
  `off`); `PUT` com `custom` sem imagem → 400; os membros do servidor e da conversa
  trazem os campos.
- Front: `Nameplate` só monta o GIF no hover ou foco e não renderiza nada sem URL;
  `Avatar` com moldura (parada × animada); a prévia mostra "Animando" só com GIF; o
  recorte de GIF mantém a transparência; a lista de IDs de modo bate com o backend
  (igual ao teste do `nameStyle`).

## Deixado para quem implementa

- Nomes internos de funções e arquivos, fora os citados acima.
- Onde exatamente os helpers de URL (`/static`) entram em `profileMedia.ts`.
- O tamanho exato do degradê de leitura (ajustar vendo a tela).
