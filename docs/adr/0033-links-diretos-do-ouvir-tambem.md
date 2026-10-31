# 0033. Achar a faixa do "Ouvir também" no servidor, com APIs públicas e cache em memória

- Status: aceito
- Data: 2026-10-30

## Contexto
O menu "Ouvir também" da atividade de música (#445) abria a **busca** de cada
serviço por "artista - título", porque a atividade não traz URL nem ID da
faixa. O dono quer abrir já na música (e, no YouTube, já tocando). Forças:
a mesma música é clicada por várias pessoas (cache compensa muito); as fontes
precisam ser gratuitas, sem login de usuário e só com a stdlib HTTP (regra 7:
sem dependência nova); nenhuma falha pode quebrar o menu (o link de busca
continua valendo); e o "Adicionar à fila do Maestro" demorava ~7,5 s fazendo
a mesma busca no YouTube que o link direto precisa.

## Opções consideradas
1. **Resolver no cliente** (cada app chama as APIs): repete a busca por pessoa,
   esbarra em CORS (Deezer não manda) e espalha cotas por IP de usuário. Descartada.
2. **Odesli/song.link** (um link de entrada → links de todas as plataformas,
   inclusive Spotify): era o plano, mas a API sem chave foi aposentada em 2026
   (`401 PUBLIC_API_ACCESS_DEPRECATED`, conferido em 2026-10-30) e chave nova
   não é garantida. Descartada.
3. **Endpoint autenticado no backend consultando cada serviço** (escolhida):
   iTunes Search API → Apple Music; API pública do Deezer (`/search`) → Deezer;
   a busca do Maestro (yt-dlp `ytsearch5`, `--flat-playlist`) → YouTube e
   YouTube Music (`music.youtube.com/watch?v=ID` abre tocando); Spotify Web API
   com *client credentials* (token do app, sem login de ninguém) **só se**
   `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` estiverem configurados.

## Decisão
`GET /api/music/links?artist=&title=` (domínio novo `internal/musiclinks`, no
molde do `giphy`: serviço externo + cache em memória) consulta as fontes em
paralelo, cada uma com timeout próprio (3 s nas APIs HTTP, 8 s no yt-dlp) e um
balde de fichas (iTunes 20/min, Deezer 40/5 s, Spotify 60/min, yt-dlp 30/min);
sem ficha, a fonte fica de fora dessa vez. Só vira link direto o resultado que
**bate** com a faixa: título sem versão ("- Remastered", "(Ao Vivo)") e
primeiro artista, comparados sem acento, caixa nem pontuação, preferindo o
título exato; e só URL https do host do serviço. A resposta inteira fica no
cache 24 h quando todas as fontes responderam (achando ou não) e 5 min quando
alguma falhou, com teto de 2000 entradas. A busca do YouTube é a mesma do
"Adicionar à fila" (`music.Manager.FindTracks`, cache de 30 min com busca em
andamento compartilhada): abrir o menu já deixa a faixa pronta para a fila.

No cliente, o menu pede os links ao abrir e mostra os de busca na hora; quando
os diretos chegam, troca. Clique antes da resposta espera até 3 s pelo link
direto e, se não vier, abre a busca.

## Consequências
- Links diretos para Apple Music, Deezer, YouTube e YouTube Music sem chave
  nenhuma. Spotify segue na busca até alguém criar um app no Spotify for
  Developers (desde 2026-02 o modo de desenvolvimento exige dono Premium) e
  pôr as duas variáveis no `.env`; 403/erro do Spotify só derruba o Spotify.
- O cache vive na memória do processo: reiniciar o backend esvazia (custo: a
  1ª abertura de cada música volta a levar ~3 s no YouTube).
- Uma busca yt-dlp por música nova aberta no menu (antes só no clique da fila);
  o limite de 30/min segura abuso.

## Fontes
- iTunes Search API: https://performance-partners.apple.com/search-api
- Deezer API (search): https://developers.deezer.com/api/search
- Spotify, client credentials: https://developer.spotify.com/documentation/web-api/tutorials/client-credentials-flow
- Spotify, mudanças de acesso em 2026: https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security
- Odesli aposentado (relatos com o erro 401): https://github.com/eeegoloauq/music-bot/issues/7, https://github.com/EdgarLefevre/SongLink_Discord_Bot/pull/1
- Quem migrou do Odesli para as APIs de cada plataforma: https://github.com/VictorNain26/AubeSonore/pull/221
