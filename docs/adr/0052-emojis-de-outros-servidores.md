# 0052. Usar emojis e figurinhas de outros servidores

- Status: aceito
- Data: 2026-11-04
- Relacionado: [0028](0028-emojis-personalizados.md), #528 (perfil privado do servidor)

## Contexto

Quem participa de vários servidores quer usar os emojis e as figurinhas de um no outro, e em DMs
e grupos, como no Discord e sem paywall. Quatro forças decidem o desenho:

- **Autorização no envio.** O texto `<:nome:id>` é só texto: qualquer um pode digitá-lo. O cliente
  não decide nada.
- **Quem recebe não é da origem.** Hoje o arquivo só é entregue a membros do servidor do item, e o
  app nem sabe o nome dele quando é reação (`<:id>`).
- **Privacidade.** Dizer "de <servidor>" não pode vazar servidor privado.
- **Bits de permissão.** Os bits 0 a 30 estavam todos em uso, e o app faz bitwise em 32 bits. O
  teste `TestAllBitsFitInt32` e o comentário de `perms.go` proibiam o bit 31.

## Opções consideradas

### Onde guardar a permissão

1. **Bit 31, com o app tratando o resultado sem sinal (escolhida).** Coluna, API e cálculo não
   mudam. No JS, `&`, `|` e `~` devolvem inteiro de 32 bits com sinal: o bit 31 sai negativo. Basta
   normalizar com `>>> 0` o que sai de `lib/permissions.ts` e o que vai ao servidor.
2. **Passar para BigInt e string na API, como o Discord** (permissões em inteiro de tamanho
   variável, serializado em string). É o certo a longo prazo, mas muda o contrato de todos os apps
   instalados e todo o cálculo no app, por uma permissão só.
3. **Reaproveitar um bit existente** (ex.: `ADD_EMOJIS`). Não precisa de bit novo, mas mistura
   "enviar ao servidor" com "usar de fora", e o dono não conseguiria separar.

### Como liberar o arquivo a quem recebe

1. **Marcar o item como publicado no primeiro uso de fora (escolhida).** `published_at` nas duas
   tabelas. O arquivo sai para quem é membro ou, se publicado, para quem tem media token.
2. **Conferir a cada arquivo se a pessoa vê alguma mensagem que usa o item.** Mais restrito, mas é
   uma busca no texto das mensagens a cada imagem, e reação e figurinha pedem caminhos diferentes.
3. **Copiar o arquivo para o servidor de destino.** Não mexe no acesso, mas duplica arquivo, gasta
   disco e o item deixa de ser apagável na origem.

### Texto sem permissão

1. **Trocar `<:nome:id>` por `:nome:` no servidor (escolhida).** A mensagem sai, como no Discord, e
   o token que não pode passar nem chega a quem recebe.
2. **Recusar a mensagem inteira.** Perder o texto porque um emoji não pode é ruim, principalmente
   ao colar texto de outra conversa.

## Decisão

- `USE_EXTERNAL_EMOJIS` é o bit 31: ligada no @everyone (migration 000189) e por canal. Vale no
  destino. Em DM e grupo não há cargos: basta ser membro da origem. **Não sobrou bit**: a próxima
  permissão precisa da opção 2 acima.
- O novo pacote `internal/expression` concentra a regra (`Guard`), usada ao enviar, editar e reagir,
  e a resposta de `POST /expressions/resolve` (até 100 ids por pedido), que diz nome e origem do
  que a pessoa pode conhecer. Item do próprio servidor nunca pede a permissão.
- O arquivo só fica aberto depois de um uso de fora autorizado. O id é um UUID aleatório e o media
  token é obrigatório, então não dá para listar arquivos: quem não recebeu o id não chega neles.
- Somar-se a uma reação que já está na mensagem não pede nada: senão, quem não é da origem não
  conseguiria repetir a reação que está vendo.
- Servidor com perfil privado (`server_profiles.private`, da #528) responde só `private: true` a
  quem não é membro: nem nome nem ícone. Como a #528 pode entrar antes ou depois, a consulta confere
  se a tabela existe; se a checagem falhar, ninguém de fora vê o nome.
- Apagado na origem: a mensagem guarda o nome da figurinha (`deleted_sticker_name`, gatilho antes do
  `DELETE`, porque o `ON DELETE SET NULL` perde o id) e o emoji deixa uma lápide (`deleted_emojis`),
  porque a reação só tem o id. Os dois mostram `:nome:`.
- Seletor: uma casca só (`ExpressionPicker`) para as abas de emoji e figurinha e para as reações. As
  seções montam sob demanda (`IntersectionObserver`, como o pack base já fazia) em vez de virtualizar
  a lista, e as figurinhas vêm de uma consulta só (`GET /stickers`) em vez de uma por servidor.

## Consequências

- Boas: uma regra só no servidor, sem dependência nova; DM e grupo também passam a aceitar figurinha.
- Ruins: emoji ou figurinha publicado é visível a qualquer conta que tenha o id (como no CDN do
  Discord), mesmo que a pessoa não veja a mensagem. Publicado não volta atrás; para tirar do ar,
  apague o item.
- App antigo manda o bit 31 como número negativo ao salvar um cargo: `permission.Normalize` devolve
  o bit certo (há teste). Ele ignora a permissão ao calcular, o que é inofensivo: o servidor decide.
- Mensagens antigas com emoji de fora, de antes desta mudança, continuam `:nome:` para quem não é
  da origem até o emoji ser usado de novo. Não há varredura de mensagens na migration.

## Fontes

- [Permissões do Discord (espelho da documentação)](https://scroll-follow-fix--hackweek-discord-api-docs.netlify.app/docs/topics/permissions): `USE_EXTERNAL_EMOJIS` e o inteiro serializado em string.
- [discord-api-types](https://github.com/discordjs/discord-api-types/blob/main/payloads/v6/permissions.ts): valores dos bits.
- [MDN: Unsigned right shift](https://docs.w3cub.com/javascript/operators/unsigned_right_shift): `>>>` zera o bit de sinal.
