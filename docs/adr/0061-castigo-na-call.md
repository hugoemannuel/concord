# 0061. Pôr alguém de castigo nas calls do servidor, direto ou por votação da call

- Status: aceito
- Data: 2026-11-09
- Relacionado: #588, [0054](0054-emojis-de-outros-servidores.md) (acabaram os bits de permissão), [0017](0017-visitante-na-call.md)

## Contexto

A issue #588 pede um castigo configurável: por um tempo, a pessoa não fala, não entra em call ou
não ouve. Dá para aplicar direto ou abrir uma votação em que a maioria da call decide. Regra do
dono do produto: qualquer pessoa abre a votação; aplicar direto, só quem tem um cargo com
permissão. As forças:

- **Valer no servidor, não só na tela.** Falar e ouvir são as permissões do LiveKit (publicar e
  assinar); entrar é a checagem de *Conectar* da chamada. O castigo precisa entrar nesses dois
  pontos e acabar sozinho no prazo, mesmo com reinício (deploy) no meio.
- **Sem bit de permissão livre.** O ADR 0054 usou o último bit (31); uma permissão nova pede
  passar todo o cálculo para BigInt e string na API, mudando o contrato de todos os apps instalados.
- **Sem engordar a chamada.** `call/service.go` é god file: nada de métodos novos lá.

## Opções consideradas

### Onde guardar o castigo

1. **Até quando cada efeito vale, por pessoa e servidor (escolhida).** Uma linha com
   `speak_until`, `connect_until` e `listen_until` (como o `communication_disabled_until` do
   Discord). Somar castigos é ficar com o prazo mais longo de cada efeito; vencer é a hora passar.
   A memória tem o mesmo índice e a chamada consulta sem ir ao banco.
2. **Um registro por castigo, com o efeito valendo pela soma dos ativos.** Guarda o histórico, mas
   o registro de auditoria já faz isso, e tirar o castigo vira apagar vários.
3. **Reaproveitar o silenciar/ensurdecer do servidor com um timer.** Mistura o castigo com o que o
   moderador ligou à mão: liberar o silêncio tiraria o castigo, e não cobre "não entrar".

### Quem aplica direto

1. **A moderação de voz que cada efeito prolonga (escolhida):** falar pede *Silenciar membros*,
   ouvir pede *Ensurdecer membros*, entrar pede *Desconectar membros*, no servidor, e estar acima
   do alvo na hierarquia. Tirar antes da hora pede o mesmo. Sem bit novo e sem mudar contrato: quem
   já silencia por tempo indeterminado silencia por 5 minutos.
2. **Permissão nova "Castigar membros"** (como o *Moderar membros* do Discord). É o ideal, mas
   exige a migração para BigInt do ADR 0054.

### Votação

1. **Em memória, uma por call, pelo REST, com o resultado no WebSocket da call (escolhida).**
   Votam os **membros do servidor** que estavam na call quando a votação abriu, **menos o alvo**
   (ele não vota e não conta). Passa com **mais da metade** desses votos; quem abre já vota sim.
   Precisa de pelo menos 2 votantes (call de 3 pessoas): numa call de 2, uma pessoa sozinha seria
   "a maioria". Dura 60 s; fecha antes se o sim chegar à maioria ou não puder mais chegar. Quem
   abre espera 30 s para abrir outra. Visitantes não abrem nem votam.
2. **Contar o alvo como voto contra.** Numa call de 4 o castigo pediria os 3 outros, o que trava o
   uso; o alvo já não vota.
3. **Gravar a votação no banco.** Dura 60 s: um reinício a perde e quem quiser abre outra.

## Decisão

- Pacote novo `internal/castigo` (modelo, índice, repositório, serviço, votação, varredura, rotas)
  e a tabela `castigos` (migration 000201). A chamada ganha só `call/castigo.go`: a interface
  `CastigoSource` (consultada em `requireConnect`, no token da mídia e ao revalidar) e
  `EnforceCastigo`, que aplica na hora a quem está na call (sai se não pode entrar; senão o LiveKit
  recebe as novas permissões).
- O castigo vale em **todos os canais de voz do servidor**, não em DM. Prazos: 1, 5, 10 e 30 min e
  1 h. A varredura (5 s) devolve a fala e a escuta a quem está na call; entrar e o token já olham a
  hora certa.
- Eventos: `castigo:update` para a sala do servidor (o castigo da pessoa, com prazos nulos quando
  acaba) e `castigo:vote` para a call. O registro de auditoria grava `voice.castigo` (efeitos,
  duração e se foi direto ou votação; na votação, o autor é quem abriu) e `voice.castigo.lift`.

## Consequências

- Boas: nada muda no contrato de permissões; o servidor decide tudo (o app só mostra); o castigo
  sobrevive ao reinício.
- Ruins: quem pode silenciar mas não ensurdecer só castiga direto de falar (é a regra, mas pode
  surpreender). Quando a permissão nova existir (BigInt), troca-se `Effects.perms`.
- A votação não sobrevive a reinício; quem entra na call depois de ela abrir não vota.

## Fontes

- [Discord: Time Out FAQ](https://support.discord.com/hc/en-us/articles/4413305239191-Time-Out-FAQ) e
  [Modify Guild Member, `communication_disabled_until`](https://discord.com/developers/docs/resources/guild#modify-guild-member): o castigo como "até quando".
- [LiveKit: managing participants, `UpdateParticipant`](https://docs.livekit.io/home/server/managing-participants/): `canPublish` e `canSubscribe` mudados com a pessoa na sala.
- [Valve Developer Community: Voting](https://developer.valvesoftware.com/wiki/Voting) (vote kick dos jogos Source): votação curta, com quórum e espera entre votações.
