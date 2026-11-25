# 0073. Codec e decodificação da live: marca que não se renova, tempo do motor nativo, H.265 que não decodifica e camada baixa por decodificador

- Status: aceito
- Data: 2026-11-25
- Relacionado: [0015](0015-lives-em-h264.md), [0031](0031-live-pelo-helper-rust.md), [0032](0032-sinais-de-qualidade-das-lives-e-calls.md), [0048](0048-live-sem-lado-impar-e-codec-que-falha.md), [0049](0049-h264-da-live-na-placa-pelo-perfil-high.md)

## Contexto

Quatro defeitos de qualidade, provados na telemetria de produção (11/11 a 25/11;
análises `an-transmite` A2/A3 e `an-assiste` A2–A5):

1. **A marca "H.264 caiu no processador" se renovava sozinha.** O `ScreenAdapt`
   chamava `markSoftwareCodec` a cada leitura (2 s) com a live no processador;
   a marca grava a data, então a validade de 7 dias (ADR 0048) recomeçava sem
   fim. Com a marca, o plano oferece o H.264 Baseline, que no Windows só sai
   pelo OpenH264 (ADR 0049), e a live volta a sair no processador. Uma Intel
   Iris Xe teve 7 de 7 lives no processador a 18 fps; uma GTX 970 ficou marcada
   11 dias. Uma sessão com o driver fora do ar ("Microsoft Basic Render
   Driver") marcou uma RX 9060 XT boa por 7 dias.
2. **O motor nativo mandava o tempo em microssegundos.** `stats.rs` repassa o
   `timestamp` do JSON do libwebrtc. Conferido no código: `RTCStats::ToJson()`
   (`webrtc/src/api/stats/rtc_stats.cc`) escreve `"timestamp":` `timestamp_.us()`;
   o `webrtc-sys` 0.3.52 entrega esse JSON (`report->ToJson()` em
   `include/livekit/jsep.h`) e o `libwebrtc` 0.3.55 só o desserializa
   (`timestamp: i64`). O app lia como ms: fps, captura, kbps e `seconds` da live
   nativa saíam 1000 vezes menores (o `seconds` batia no teto de 600).
3. **Tela preta para quem anuncia H.265 e não decodifica.** Uma GTX 970 recebeu
   H.265 por 190 min decodificando 7,9 de 12,9 quadros/s, com 32 min de tela
   preta (mais de 5 chegando, menos de 1 decodificado); em H.264 faz 42 de 42.
   A reserva H.264 já funciona para quem não anuncia o H.265 (19 lives, 7
   pessoas). O SFU escolhe o codec pelo que o assinante negocia.
4. **Decodificador que não dá conta não pedia a camada menor.** Uma Intel UHD
   730 decodificou 18 de 52 quadros/s a 44 ms por quadro e mandou 4 080 pedidos
   de quadro-chave em 2 h (30 % dos PLI de 14 dias), e os outros espectadores
   receberam 20 quadros-chave/min. Havia uma camada de 720p que ninguém pediu:
   `adaptiveStream` está desligado (`livekit.ts`).

Os limiares do controlador de degraus e os presets ficam como estão: a análise
mostrou que estão certos.

## Opções e decisão

### 1. Marca do codificador

Opções: (a) marcar uma vez por live; (b) não regravar marca vigente; (c) não
marcar com o Basic Render Driver; (d) guardar a placa na marca e ignorá-la se
mudar. **Decisão: todas, porque são baratas e cobrem casos diferentes.**

- `ScreenAdapt` repassa a queda **uma vez por live**.
- `ScreenSender` só marca se o plano publicado esperava a placa
  (`support[codec] === 'hardware'`); se já esperava o processador (marca
  vigente, ou máquina sem placa), marcar só renovaria a marca.
- `markSoftwareCodec` não regrava marca vigente (a validade conta da primeira
  queda) e não marca com o "Microsoft Basic Render Driver".
- A marca passa a ser `{"at": ms, "gpu": "<renderer do WebGL>"}` e só vale na
  mesma placa (`screenGpu.ts`, o mesmo nome da telemetria).
- **Marcas do formato anterior (só a data) deixam de valer**: estavam
  contaminadas pela renovação. Uma máquina que cai de verdade no processador vai
  tentar a placa uma vez, cair e ser marcada de novo (o pior caso é uma live
  começar no codec errado; para AV1/H.265 a rede de segurança da ADR 0048
  republica em ~4 s).

### 2. Tempo do motor nativo

Opções: (a) dividir por 1000 em Rust; (b) dividir por 1000 no TypeScript;
(c) **trocar o `timestamp` pela hora de chegada da leitura no renderer**.
**Decisão: (c)**, em `stampNativeStats` (`nativeLiveChoice.ts`), chamado quando o
evento `stats` chega em `NativeLiveSession`.

- Vale para o helper de hoje e para um helper corrigido depois (ms), e não
  depende do relógio do libwebrtc (época ou monotônico), o que um "÷1000" no
  TypeScript não garante.
- Não exige recompilar o helper: hoje ele só é compilado no build do Linux
  (`scripts/build-linux.sh`, imagem Debian + clang + libwebrtc de 28 MB), e se a
  compilação falha o app sai sem o helper. Uma correção só em Rust também não
  poderia ser testada aqui sem compilar o `webrtc-sys` inteiro.
- Erro da chegada: o atraso do IPC (milissegundos) num intervalo de 2 a 20 s.
- `stats.rs` só ganhou um comentário dizendo a unidade.

### 3. H.265 que chega e não decodifica

Opções: (a) mexer no SDP ou no `setCodecPreferences` da conexão de assinatura
do livekit-client (descartada: frágil, o SDK remonta o SDP; mesmo motivo da ADR
0048); (b) quem transmite republicar sem H.265 (descartada: piora a live de
todos por causa de um aparelho); (c) o assinante pedir a reserva ao servidor
(descartada: o SDK não deixa, o SFU decide pelo que foi negociado);
(d) **marca no aparelho e, na próxima abertura, não anunciar H.265 para
receber**. **Decisão: (d).**

- Detector puro `screenHevcDecodeGuard.ts`, alimentado a cada 2 s pelo vigia da
  recepção (`screenReceiveWatch.ts`, só lives assinadas e com vídeo ligado).
  Dispara com **5 leituras seguidas (~10 s)**, depois das **3 primeiras** da
  live (espera do quadro-chave), em que: o codec é H.265, chegam **≥ 5
  quadros/s**, saem decodificados **≤ 20 %** dos que chegam e a perda de pacotes
  no intervalo é **< 2 %**. Qualquer leitura fora disso zera a contagem.
- Disparou: uma vez por chamada, o renderer manda `screen-share:hevc-decode-failed`
  ao processo principal, que grava `Concord/hevc-decode-failed.json`
  (`{"savedAt": ms}`) sem regravar marca vigente. A próxima abertura lê a marca no
  import de `captureSwitches`, **antes do `ready`** (e antes do
  `app.setPath('userData')` do `index.ts`, por isso o caminho é montado igual a
  ele), e acrescenta `WebRtcAllowH265Receive` ao `--disable-features`. O nome foi
  conferido no código do Chromium (`rtc_video_decoder_factory.cc`: sem a feature
  o H.265 não entra nos formatos suportados nem no `QueryCodecSupport`) e no
  binário do Electron 44.9.3 (`kWebRtcAllowH265Receive`). Ela não mexe no envio
  (`WebRtcAllowH265Send`) nem no `<video>` comum. O `gpu.log` ganha
  `hevc_receive=off`.
- Com o driver fora do ar (Basic Render Driver) não marca.
- A telemetria da live assistida leva o evento `decoder_falhou` (detalhe:
  `h265: 12,9 chegam, 0,4 decodificados por segundo`; no navegador, onde não há
  como desligar o H.265, o detalhe termina em `(navegador, sem marca)`), na
  amostra seguinte ou no fim da sessão; o que ninguém levou em 2 min é descartado.
- Com a marca, quem transmite continua codificando H.265: o
  `setCodecPreferences` do perfil High (ADR 0049) é validado pelo libwebrtc
  contra a união dos codecs de envio e de recepção (`VerifyCodecPreferences` em
  `pc/rtp_transceiver.cc`), e o H.265 segue no envio.
- **Validade de 3 dias**, contada da primeira falha (o codificador usa 7). O
  aparelho ruim volta a receber H.265 depois disso, tem ~16 s de tela preta e é
  marcado de novo; o aparelho bom marcado por engano fica no H.264 só 3 dias.
- **Sem texto novo na tela** (precisa de aprovação do dono): a correção vale na
  próxima abertura do app, sem aviso.

**Falso positivo.** Um aparelho bom marcado recebe a reserva H.264 (720p30, na
placa pelo High, ADR 0049) em lives H.265 por 3 dias, em vez do H.265 na
resolução da live. Live só em H.265 sem reserva não existe hoje (as lives H.265
já levam H.264). Casos que poderiam enganar e o critério que os barra: a live
parada na origem (não chegam 5 quadros/s), o começo esperando o quadro-chave (3
leituras ignoradas), rede ruim (perda ≥ 2 %), e um decodificador apenas lento (8
de 13 não é "quase nada"). Para desfazer à mão: apagar
`hevc-decode-failed.json` na pasta de dados do app.

### 4. Camada baixa quando o decodificador não dá conta

Opções: (a) ligar o `adaptiveStream` do SDK (descartada: depende dos elementos
anexados pelo SDK, que a UI não usa, e reage ao tamanho do elemento, não ao
decodificador); (b) deixar o SFU escolher (ele só reage à rede, não ao
decodificador de quem assiste); (c) **detector no app que chama
`setVideoQuality(LOW)` e volta com histerese**. **Decisão: (c).**

- Detector puro `screenDecodeOverload.ts`: gargalo = chegam ≥ 10 quadros/s,
  decodificados < 80 % dos que chegam **e** tempo por quadro > 60 % do
  intervalo entre quadros. **3 leituras seguidas** (6 s) → camada baixa.
- Volta para a de cima depois de **3 min seguidos sem gargalo**; um gargalo na
  espera recomeça o relógio. Cada nova descida na mesma live dobra a espera (3,
  6, 12, até 24 min).
- `RemoteSubscriptions.setDecodeLimited` guarda o pedido por identidade e o
  `applyPerson` o aplica só ao vídeo da tela. Só age quando a publicação tem
  mais de uma camada (`trackInfo.layers`); nas lives H.265 de uma camada não há o
  que pedir. Parou de assistir: o pedido volta para a camada de cima.

## Consequências

- Máquinas presas no processador saem da marca na primeira atualização (marca
  antiga não vale) e voltam a tentar a placa. Ganho em fps não está provado: a
  captura do Chromium também é gargalo (A1 da análise).
- A live nativa passa a ter fps, captura, kbps e duração certos, e a comparação
  nativo × Chromium fica possível.
- Quem tem a GTX 970 (e placas parecidas) recebe H.264 a partir da segunda
  abertura do app depois da falha; na primeira ainda vê a tela preta por ~16 s
  até a marca e segue assim até reabrir o app.
- Quem tem decodificador fraco passa a ver 720p em vez de congelar, e a live
  para de receber quadros-chave a cada poucos segundos por causa dele.
- Custo: uma leitura de `getStats()` a cada 2 s por live assistida (o painel já
  fazia o mesmo quando aberto). Sem tabela, coluna nem migration nova; o evento
  `decoder_falhou` é no máximo um por chamada (linhas desprezíveis em
  `live_events`, com a retenção de 14 dias que já existe).
- Dado novo coletado: o evento `decoder_falhou` com o codec e dois números
  (quadros/s chegando e decodificados). Nada do conteúdo da live.

## Não verificado

- O efeito de `--disable-features=WebRtcAllowH265Receive` numa GTX 970 no
  Windows (a reserva chegando de verdade): sem a placa e sem Windows aqui.
- O `trackInfo.layers` de uma live H.264 com a camada extra no SFU real (o teste
  usa um dublê); se vier vazio, o detector da camada baixa nunca age.
- O comportamento numa Intel UHD 730 e numa Iris Xe reais.
- Se a camada do Blink acrescenta alguma validação ao `setCodecPreferences` além
  da do libwebrtc (o código do Blink não pôde ser baixado aqui): se acrescentar, o
  H.264 High de quem transmite com a marca cairia no OpenH264.
