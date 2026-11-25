# 0070. Telemetria das calls e lives no app Android: a mesma rota, cópia adaptada e três sinais do celular

- Status: aceito
- Data: 2026-11-25
- Complementa: [0029](0029-observabilidade-das-lives.md) e [0032](0032-sinais-de-qualidade-das-lives-e-calls.md)
  (mesmo pipeline, mesmas tabelas, mesmo painel); [0021](0021-app-mobile-expo.md) (app Android),
  [0023](0023-voz-no-app-mobile.md) (voz), [0027](0027-transmissao-de-tela-no-app-mobile.md) (tela),
  [0030](0030-servico-em-primeiro-plano-da-chamada-no-app-mobile.md) (serviço em primeiro plano)

## Contexto

O app Android não mandava telemetria nenhuma: call de voz, live assistida ou tela transmitida
pelo celular eram invisíveis no painel `/observabilidade`. Quando alguém no celular ouve mal ou
cai, não há número. O desktop manda desde a 0029/0032 (`POST /api/obs/telemetry`).

Forças:

- **Sem dependência nova.** O app já tem `@livekit/react-native` (AudioSession),
  `@livekit/react-native-webrtc` (o `getStats()`), `@react-native-community/netinfo` (tipo de
  rede) e `expo-constants` (versão do app). `expo-device` e `expo-application` não estão no
  `package.json` (o segundo só vem por dentro do `expo`): ficam de fora.
- **ADR 0021**: lógica pura portada por cópia adaptada, com os testes.
- **ADR 0023**: só `livekitMedia.ts`/`livekitScreen.tsx` falam com o SDK; o resto usa portas.
- **Bateria**: nada fora de call; o mesmo ritmo do desktop (voz 1 por minuto, live a cada 20 s),
  num pedido só por leitura.
- **VPS pequena** e privacidade iguais à 0029.

O `getStats()` do Android vem do libwebrtc nativo (M150, `android-prefixed`), serializado pelo
`StringUtils.statsToJSON` com os nomes do W3C (`inbound-rtp`, `remote-inbound-rtp`,
`candidate-pair`, `media-source`, `concealedSamples`...). As contas do desktop servem sem mudança;
o que muda é o nome do codificador: no Android ele é o do MediaCodec (`c2.qti.avc.encoder`,
`OMX.Exynos...` na placa; `c2.android.*`/`OMX.google.*` no processador), que a regra do desktop
não reconhece.

## Opções consideradas

**Como levar a lógica:**

1. **Pacote comum** `frontend` + `mobile` (workspace). Uma cópia só, mas outro build, outro
   tooling e a 0021 já disse: só quando a duplicação doer.
2. **Serviço de terceiros** (Firebase Performance, Sentry, callstats/observertc, relatórios de
   call do SDK do fornecedor, como o Telnyx faz no fim da call). Dependência nova e dado saindo.
3. **Cópia adaptada em `mobile/src/features/observability/`**, mesma rota e mesmo formato
   (escolhida). O painel e as consultas valem para os dois apps sem mudança no formato.

**Como saber que a voz não conectou ou caiu** (o `callController` do app não tem fase
`failed` nem etapa, como o `callStore` do desktop):

1. Ler o aviso mostrado à pessoa (`callNoticeStore`). Frágil: o mesmo aviso serve para "fulano
   recusou", "a chamada terminou" e "entrou em outro aparelho".
2. Pôr callbacks novos no `callController`. Funciona, mas espalha telemetria pela orquestração.
3. **Decorar as portas na montagem** (`callRuntime.ts`): a API (`startCall`/`getCallToken`) e a
   mídia (`connect`, `onConnection`) passam por uma sonda que anota a falha e a queda
   (escolhida). O controller não muda; a sonda é pura e testada com portas falsas. O tempo para
   entrar e as reconexões saem das fases do `callSessionStore`, só lidas.

**Onde guardar o modelo do aparelho:** na coluna `gpu` (o SoC vem com o modelo) seria
reaproveitar um nome que diz outra coisa; **coluna própria `device`** em `live_sessions`
(migration 000214, escolhida).

## Decisão

O app Android manda, pela mesma rota, as mesmas sessões do desktop: `call` (a cada 60 s),
`assiste` e `transmite` (a cada 20 s), com os mesmos campos. O timer só existe com a call em
andamento (`connecting`, `active`, `reconnecting`); ao sair, uma última leitura manda o fim das
sessões e para.

| Pergunta | Sinal | Ação |
|---|---|---|
| (todas as da 0032) | os mesmos campos; o que o Android não entrega fica nulo | as mesmas |
| O problema é do Android ou do desktop/web? | `target = android` (o backend passa a aceitar só `desktop`, `web` e `android`) e a distribuição "Plataforma" no painel | Piora só no Android → olhar o app/SDK do celular, não o servidor. |
| Piora em um modelo de celular? | `device`: fabricante e modelo (`Platform.constants`, sem dependência) e a distribuição "Aparelho" | Decodifica no processador ou cai num modelo → exceção de codec/qualidade para ele, ou avisar quem usa. |
| Dados móveis são piores que Wi-Fi? | `network`: `wifi`, `cellular-4g`, `cellular-5g`... (NetInfo) e a distribuição "Rede" | Quedas/síntese só em dados móveis → ajustar bitrate/RED para celular ou avisar. |
| A call seguiu com o app em segundo plano (o serviço da 0030 segurou)? | eventos `segundo_plano` e `primeiro_plano` (quanto tempo fora do app); motivo "Caiu com o app em segundo plano" | Caiu/reconectou em segundo plano → o serviço não segurou (economia de bateria do fabricante): instrução para liberar o app ou rever o serviço. Leitura com intervalo bem maior que 60 s em segundo plano = o JavaScript foi pausado. |
| A queda veio da troca Wi-Fi ↔ dados no meio da call? | evento `rede_trocou` (`wifi → cellular-4g`); motivo "Caiu ao trocar de rede" | Queda sempre junto da troca → é a troca de IP (ICE restart do LiveKit), não o servidor. |
| A queixa de áudio é do Bluetooth/alto-falante? | evento `rota_do_audio` no começo da call e a cada troca: `bluetooth`, `headset`, `speaker` ou `earpiece` | Síntese/queixa só no Bluetooth → perfil de voz do fone (HFP), não a rede; eco no alto-falante → cancelamento de eco do aparelho. |
| A voz não conectou: em que etapa? | `conexao_falhou`: `entrando (acesso)` (o nosso servidor, só rede/5xx; recusas 4xx como sala trancada não contam), `entrando (voz)` (LiveKit), `conectada`/`reconectando: caiu` | As mesmas da 0032. |

A rota do áudio é **inferida**: o `getAudioOutputs()` do Android devolve as saídas disponíveis e
o AudioSwitch do LiveKit escolhe pela ordem fixa Bluetooth > fone com fio > alto-falante >
auricular (o app nunca escolhe à mão). Se um dia o app ganhar seletor de saída, a inferência
precisa ler a escolha.

Falha antes de existir sessão (a entrada caiu em menos de 20 s) não se perde: a última leitura
manda uma sessão de voz só com os eventos e o fim.

**Fora** (sem pergunta clara ou sem API sem dependência):

- Bateria, temperatura e modo de economia: sem API no Expo instalado (`expo-battery` seria
  dependência nova); a pergunta "o fabricante mata o serviço" já é respondida pelo segundo
  plano.
- Intensidade do sinal Wi-Fi/celular, operadora e SSID: o NetInfo só entrega com permissão de
  localização, e SSID/operadora dizem onde a pessoa está.
- Núcleos do processador e placa de vídeo: sem API no React Native; vão `0` e vazio.
- Degrau do controlador, reserva de codec e motivo do codec: o app não tem controlador
  adaptativo nem reserva; ficam nulos/vazios.
- Versão do app: `expo-constants` dá a do `app.config.ts` (fixa em 0.1.0 hoje). Vai assim;
  separar builds depende de alguém versionar o APK.

## Consequências

- Volume: igual ao do desktop por sessão. Para 20 pessoas no Android com 3 h de call e 1 h de
  live assistida por dia: ~3 600 amostras de voz + ~3 600 de live ≈ 7 200 linhas/dia em
  `live_samples`, ~100 mil em 14 dias (~15 MB), mais alguns eventos por call (no máximo 8 por
  leitura). A retenção segue 14 dias.
- Custo no aparelho: um `getStats()` por voz a cada 60 s e um da live a cada 20 s (o que o
  painel da live do desktop já faz), um `getAudioOutputs()` por minuto, os ouvintes de AppState e
  NetInfo só durante a call. Nada fora de call.
- Migration 000214: `live_sessions.device` (texto, vazio no desktop).
- O backend passa a gravar `target` só se for `desktop`, `web` ou `android` (os apps atuais já
  mandam esses).
- Privacidade: números técnicos, o modelo do aparelho, o tipo de rede e a saída de áudio. Nada
  do que se fala ou mostra, nenhum IP, SSID ou operadora.

## Fontes

- W3C, Identifiers for WebRTC's Statistics API: https://www.w3.org/TR/webrtc-stats/
- libwebrtc, `powerEfficientEncoder`/`powerEfficientDecoder`:
  https://android.googlesource.com/platform/external/webrtc/+/09da10e24f
- LiveKit React Native, `AudioSession` (`getAudioOutputs`, `preferredOutputList`):
  https://github.com/livekit/client-sdk-react-native, e o código instalado
  (`AudioSwitchManager.java`, `LivekitReactNativeModule.kt`).
- Telnyx, relatórios de call do SDK Android (o padrão "resumo da call mandado ao servidor"):
  https://developers.telnyx.com/docs/development/webrtc/android-sdk/call-reports
- Telnyx, qualidade de call no JS (trocas de rede/Wi-Fi como diagnóstico):
  https://developers.telnyx.com/development/webrtc/js-sdk/how-to/monitor-call-quality
